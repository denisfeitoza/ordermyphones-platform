# Auth & Row-Level Security

> Authentication and authorization for OrderMyPhones (OMP). This document describes the design
> as it actually shipped in **Phase 1** (`supabase/migrations/20260806120000` through
> `20260806120500`, applied to `rdkkbiyugcjyrnkvobrr`). It supersedes and replaces an earlier
> pre-redesign draft (self-serve registration, multi-tenant `accounts`/`account_memberships`)
> that predated the schema built from scratch in this phase — that draft was never applied to
> any database and no code in this repo implements it.

## 1. Identities

| Identity | Issued by | Where it lives | Lands on sign-in |
|---|---|---|---|
| **Customer** | Admin invitation (Phase 5) — no open sign-up | `public.profiles` row, `role = 'customer'`, `tier` = one of `consumer`/`retailer`/`wholesale`/`distributor` | `/portal` |
| **Staff** | Admin-provisioned account | `public.profiles` row, `role = 'staff'` | `/admin` |
| **Admin** | Bootstrap / admin-provisioned account | `public.profiles` row, `role = 'admin'` | `/admin` |
| **Service** | Supabase `service_role` key | Server-only (Management API / migrations / seed scripts); bypasses RLS entirely | n/a |
| **anon** | Unauthenticated visitor | No row | Public storefront/catalog only, read-only |

There is no `accounts` / `account_memberships` layer in this schema — a customer identity is
one `auth.users` row mirrored 1:1 into one `public.profiles` row by `trg_handle_new_user`, and
`tier` lives directly on that row. A multi-user-per-account model was part of the superseded
draft; it is not built and nothing in Phase 1 assumes it. If Phase 5+ needs multi-seat accounts,
that is new schema, not a rename of anything here.

Six seeded `is_test = true` accounts exist for every role/tier lens (`admin@test`, `staff@test`,
`consumer@test`, `retailer@test`, `wholesale@test`, `distributor@test`) — see
`scripts/seed-test-users.mjs`.

## 2. Role model (DB layer)

```
anon          → unauthenticated visitors (public catalog / masking views only)
authenticated → any signed-in user (customer, staff, or admin — app-level role read from profiles)
service_role  → server-only key, used by migrations/seed scripts/Management API; RLS does not apply
```

`public.user_role` is a Postgres enum: `'admin' | 'staff' | 'customer'`. `public.customer_tier`
is `'consumer' | 'retailer' | 'wholesale' | 'distributor'`. Both are set on `public.profiles`.

There is **no custom JWT claims hook**. `role` and `tier` are read from `public.profiles` on
every request that needs them — not cached in the JWT. This was a deliberate choice over adding
a `before-token` claims hook (see §8).

### 2.1 SECURITY DEFINER role helpers

Four helpers, all `language sql stable security definer set search_path = ''`, `EXECUTE`
explicitly revoked from `public, anon, authenticated` and re-granted only to `authenticated`
(Supabase grants `EXECUTE` to `anon`/`authenticated` by default at the schema level,
independently of the `PUBLIC` pseudo-role — revoking from `PUBLIC` alone does **not** close
that path; every one of the four functions below revokes from all three explicitly):

```sql
create or replace function public.current_app_role()
returns public.user_role
language sql stable security definer set search_path = ''
as $$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') $$;

create or replace function public.is_admin_or_staff()
returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','staff')) $$;

create or replace function public.current_customer_tier()
returns public.customer_tier
language sql stable security definer set search_path = ''
as $$ select tier from public.profiles where id = auth.uid() $$;
```

`search_path = ''` (empty, never `public`) closes the schema-shadowing vector the Supabase
linter's `function_search_path_mutable` finding warns about — every fully-qualified reference
inside the function body must use `public.` explicitly, which all four do.

**Mandatory `(select ...)` wrapping in every policy that calls one of these.** Written as:

```sql
using ( (select public.is_admin_or_staff()) )
```

`(select ...)` forces Postgres to evaluate the helper once per statement (an InitPlan) instead
of once per row — the difference between an O(1) and an O(n) role check on a table scan. This
is not just a style preference: `supabase/tests/rls_suite.sql` Section 5 assertion 4
mechanically greps every policy in `pg_policies` for the unwrapped shape and fails the whole
suite if one is found (see §9). Note that Postgres re-renders the stored policy text —
`(select public.is_admin_or_staff())` comes back out as
`( SELECT is_admin_or_staff() AS is_admin_or_staff)` (schema-qualification stripped, alias
added) — the assertion's regex is calibrated against that actual rendering, not the literal
source text, and was proven to fire on a deliberately unwrapped probe policy before being
trusted (see 01-11-SUMMARY.md for the transcript).

## 3. Privilege escalation defense on `profiles`

A customer must never be able to grant themselves `admin`. Three independent legs, so that a
gap in any one does not become the whole defense:

1. **Column grants** (checked *before* RLS — RLS has no column granularity):
   ```sql
   revoke update on public.profiles from authenticated;
   grant  update (display_name, phone, locale) on public.profiles to authenticated;
   ```
   `role`, `tier`, and `is_test` are simply not in the authenticated role's `UPDATE` grant.
2. **Guard trigger** (`guard_profile_privileged_columns`, belt-and-suspenders against a future
   column-grant drift that would reopen Leg 1): raises `42501` if `role`/`tier`/`is_test` change
   under `current_user = 'authenticated'`. Explicitly excludes `service_role` and the table
   owner, so seed scripts and admin-run migrations are unaffected.
3. **Signup trigger never trusts client metadata** (`handle_new_user`): hardcodes
   `role = 'customer'` on every new `auth.users` row — the client-supplied sign-up payload's
   role field, if any, is never read. This is the third escalation path (forging the signup
   metadata) and it is closed independently of Legs 1–2.

**Admin-driven role/tier changes are not an available operation today.** They are scoped to a
**Phase 7 SECURITY DEFINER RPC with fresh re-auth**, not a direct table UPDATE — until Phase 7
ships that RPC, only `service_role` / the table owner can move these columns (e.g. via a seed
script or a manual migration). Do not build a "promote user" UI against a direct
`update profiles set role = ...` call; it will be rejected by Leg 1/2 for any
`authenticated`-role session, by design.

All three legs are proven live, not just by inspection — `rls_suite.sql` Section 1a
self-provisions a throwaway `auth.users` row, confirms the signup trigger defaulted it to
`customer` (Leg 3), then attempts a self-promotion `UPDATE` and asserts it is rejected (Legs
1+2).

## 4. Per-table RLS summary

Every table below has RLS **enabled from the migration that created it** — never bolted on
later. `supabase/tests/rls_suite.sql` Section 5 assertion 1 fails the whole suite if any public
table ever has `relrowsecurity = false`, so this list cannot silently rot.

| Table | Customer read | Customer write | Staff/admin |
|---|---|---|---|
| `profiles` | own row only | own `display_name`/`phone`/`locale` only | staff/admin read+write all (role/tier changes deferred to Phase 7 RPC) |
| `products`, `product_variants` | none (base table) — via `*_public` view only | none | staff read, admin write |
| `stock_locations`, `inventory`, `stock_movements` | none (base table) — `stock_locations`/`inventory` via `*_public` view only | none | staff read, admin/staff write (ledger is append-only, see §4.1) |
| `suppliers` | none, not even via a view of the base table (`anon_label` only, via `suppliers_public`) | none | staff read, admin write |
| `tiers`, `vendor_grade_map` | read all (`using (true)`, `to authenticated`) — storefront needs both | none | admin write |
| `pricing_settings` | **none** — the entire margin structure (floors, bands, kit costs, swing/spread thresholds) | none | staff read, admin write |
| `prices` | own tier's `visible = true` rows only (`current_customer_tier()`-gated), never another tier by requesting it | none | staff read all, admin write |
| `pricing_flags`, `grade_classification_queue` | none | none | staff/admin all |
| `orders`, `order_items` | own orders only; can create a `pending` order for self; **cannot** transition status (no self-approval path exists at the RLS layer) | insert own `pending` order/items only | staff/admin read all, transition status |
| `reconciliation_queue`, `audit_log` | none | none | staff/admin read (audit_log is append-only, see §4.1) |
| `rls_harness_canary` | none (zero policies, by design — see §9) | none | none |

### 4.1 Append-only tables

`stock_movements` and `audit_log` reuse the same `deny_ledger_mutation()` trigger function: any
`UPDATE`/`DELETE` from a non-`service_role` session raises `insufficient_privilege`. Inventory
balance is derived from the movement ledger (materialized via a sync trigger), not stored as an
independently-editable number — this is what makes the audit trail trustworthy.

## 5. Masking-view layer (customer-facing confidentiality)

Real supplier legal names and per-unit cost must never reach a customer session, but the
catalog and stock counts they derive from must. Five views solve this:
`suppliers_public`, `stock_locations_public`, `products_public`, `product_variants_public`,
`inventory_public`. Each is:

- A **plain `create view`** (definer-rights, i.e. **not** `security_invoker`) over an
  admin/staff-only base table, with an **explicit column allow-list** (never `select *`).
- Granted `select` to both `authenticated` and `anon`.

**This is deliberate, not an oversight, and the Supabase linter will flag it every time.**
`security_definer_view` is a listed, accepted advisor finding — the *only* accepted finding of
that kind, five occurrences, one per view. A plain view runs with the view owner's privileges,
so it can read the base table (which the querying customer cannot) and hand back only the
allow-listed columns. **Applying the linter's `security_invoker = true` suggestion here does not
make the view "more secure" — it makes the view return zero rows to every customer**, because a
`security_invoker` view re-checks the *querying session's* RLS against the base table, and no
customer session holds a `SELECT` policy on `suppliers`/`products`/`inventory`/etc. The failure
mode is a silently empty catalog, not a security alert — worse, not better. Every view carries a
`comment on view` saying exactly this, and `rls_suite.sql`'s design assumes the next person who
reads a linter report checks the comment before "fixing" it.

**Forbidden-column guard:** `rls_suite.sql` Section 3b (per-suite, unconditional) and Section 5
assertion 3 (phase gate, schema-level) both scan `information_schema.columns` for any
`*_public` view carrying `unit_cost_cents`, `legal_name`, `supplier_id`, `grade`,
`carrier_raw`, `source_import_id`, `notes`, or `basis_cost_cents`. A future column added to a
base table that accidentally flows into a view via a lazy `select *` fails the suite
immediately — this is checked on every run, not just at review time.

**`suppliers.legal_name`** is never inserted by any committed migration file — the migration
creates the table only. The two real supplier rows are seeded live-DB-only by
`scripts/seed-suppliers.mjs`, which reads a gitignored local JSON file and contains no
name/PII literal itself (D16 override, tighter than the plan's original disposition — see
01-07-SUMMARY.md).

## 6. Invite-only accounts

**Sign-up is closed at the Supabase Auth provider level** — "Allow new users to sign up" is
toggled OFF in the Supabase dashboard. This is the actual enforcement: `POST /auth/v1/signup`
returns `4xx` regardless of what the client sends, re-verified at every phase gate (not just
configured once and trusted — dashboard config can drift silently).

`SignUpPage.tsx` rendering "Accounts are invite-only / Request an invite" and calling nothing is
a **UI stub for the same policy**, not the enforcement itself. Do not remove the provider-level
toggle on the assumption that the frontend copy is sufficient — the provider toggle is what a
direct API call respects; the frontend stub is not on the request path at all.

Phase 5 (`ACCT-01`/`ACCT-02`) builds the real invite flow (admin creates an invite with a chosen
tier, e-mail delivers via the Supabase native sender, G0/G1/G2 onboarding gates). Nothing in
Phase 1 anticipates that flow's schema; it starts clean in Phase 5.

## 7. Authentication flows

### 7.1 Sign-in

`SignInPage.tsx` calls `supabase.auth.signInWithPassword(email, password)` directly. On success,
`store/auth.tsx` resolves `role`/`tier` via a `useQuery` keyed on `session.user.id` (not inside
the `onAuthStateChange` callback body — see the Pitfall-4 note below) and routes through the
single source of truth, `lib/roleRoutes.ts`: `admin`/`staff` → `/admin`, `customer` → `/portal`.
Every credential failure maps to one generic string, `"Email or password is incorrect"` — this
closes the account-existence oracle (a distinct "no such user" vs. "wrong password" message
would let an attacker enumerate real e-mails).

A session whose `profiles` row fails to resolve (session exists, role fetch failed) is treated
as **unauthorized, not unrestricted** — `RequireAuth` bounces it to sign-in unconditionally,
independent of whether the route declares a `roles` prop. Route-level gating:
`/admin` → `roles={['admin','staff']}`, `/portal` → `roles={['customer']}` (admin/staff are
deliberately excluded from `/portal` — Phase 7's audited "view as customer" lens, `ADMN-02`, is
the intended way for staff to see the portal, not open access today).

**Pitfall avoided:** the `onAuthStateChange` callback does synchronous state updates and query
invalidation only — no `await` inside it. Supabase's own client can deadlock if the callback
itself calls back into the auth client (e.g. awaiting another Supabase call) before returning.
The actual `profiles` fetch lives in a separate `useQuery`, not inline in the callback.

### 7.2 Password reset (PKCE recovery)

`ResetPage.tsx` calls `supabase.auth.resetPasswordForEmail(email, { redirectTo:
'<origin>/auth/callback' })`. The success panel renders for every outcome **except** a
rate-limit response — including "no such user," which GoTrue itself does not distinguish from
success. This closes the same account-enumeration oracle as §7.1, on the reset path.

`CallbackPage.tsx` is the PKCE/recovery handler. It combines three independent signals —
the `PASSWORD_RECOVERY` event from `onAuthStateChange`, a `getSession()` check in the effect
body, and whether `?code=` was present in the URL at mount — because `detectSessionInUrl`'s code
exchange can complete *before* the component mounts and subscribes; a single-signal listener can
miss it. An 8-second timer moves an unresolved link to an explicit error state instead of
spinning forever. Post-recovery navigation is always `homePathForRole(role)` read from the
recovered session's own profile — the page does not read `?from=`/`?email=` at all, closing an
open-redirect shape those params would otherwise create.

## 8. Why `profiles`-lookup, not a JWT claims hook

Role/tier are read from `public.profiles` on demand (via the SECURITY DEFINER helpers in RLS,
and via a `useQuery` client-side) rather than cached as custom claims on the JWT through a
`before-token` Auth hook. The trade-off: a claims hook would save a round-trip, but the claim
would be **stale for the token's remaining lifetime** — demoting a compromised account (e.g.
`admin` → `customer`) would not take effect until the access token naturally refreshed, up to
its full TTL. Re-deriving from `profiles` on every check means a role change is enforced on the
very next request. Adding the hook later, if the round-trip cost becomes a real problem, requires
changing zero RLS policies — every policy already calls `is_admin()`/`is_admin_or_staff()`, not
a raw JWT claim, so the hook would only change what those functions read from, not their
callers.

## 9. RLS test suite

`supabase/tests/rls_suite.sql` — checked-in, appendable, read-only, always rolled back. Grown by
section across the phase (Section 0 harness self-test/canary, 1/1a profiles isolation +
self-promotion guard, 2/2a/2b catalog/inventory isolation, 3/3a/3b supplier + cost
confidentiality, 4a/4b pricing-tier + order isolation, 5 schema-level phase gate). Run the whole
file as **one batched call** — each call is its own session, and `set local` does not survive
across calls:

```bash
supabase link --project-ref rdkkbiyugcjyrnkvobrr   # or the MCP execute_sql tool, if available
supabase db query --linked --file supabase/tests/rls_suite.sql
```

Every assertion raises on failure; a clean exit with no exception is the pass condition — there
is no output to eyeball. Section 5 (the phase gate) asserts on the schema itself with no session
simulation, so it keeps protecting every table added in later phases, not just the ones that
existed when it was written.

## 10. Threats handled at the auth layer

| Threat | Mitigation |
|---|---|
| Open self-registration | Supabase Auth provider "Allow new users to sign up" OFF, re-verified at every phase gate (§6) |
| Self-promotion to `admin`/`staff` | Three independent legs on `profiles` (§3), proven live by a self-provisioning RLS-suite assertion |
| Credential stuffing / breached passwords | Supabase Auth's HaveIBeenPwned check (`password_hibp_enabled`) |
| Account-existence enumeration via sign-in or reset | Generic error string on sign-in (§7.1); reset always shows the success panel except on rate-limit (§7.2) |
| Open redirect via recovery link params | `CallbackPage.tsx` never reads `?from=`/`?email=`; navigation is always derived from the recovered session's own role (§7.2) |
| RLS bypass via `security_invoker` "fix" on a masking view | Every view's `comment on view` explains the failure mode; `rls_suite.sql` demonstrated the sabotage once live and would catch a regression (§5) |
| A future table shipped without RLS | `rls_suite.sql` Section 5 assertion 1, schema-level, runs every suite execution |
| A future RLS-enabled table with zero policies (denies all silently) | Section 5 assertion 2 |
| A future column leaking through a `*_public` view | Section 5 assertion 3 |
| A policy calling a role helper unwrapped (per-row instead of InitPlan) | Section 5 assertion 4 |
| A future SECURITY DEFINER function without a pinned `search_path` | Section 5 assertion 5 |
| Stale/compromised role cached past a demotion | No JWT claims hook — role re-derived from `profiles` on every check (§8) |

Cross-references: `.planning/phases/01-schema-rls-real-auth/01-RESEARCH.md` (pattern catalog),
`.planning/phases/01-schema-rls-real-auth/01-11-SUMMARY.md` (phase-gate evidence).
