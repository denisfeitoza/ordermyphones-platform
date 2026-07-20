# Auth & Row-Level Security

> Authentication and authorization for the Platform. RLS is **enabled on every table** (developer standard §9). Authorization is enforced in both the application layer (edge functions, services) and the database layer (RLS policies). Both must agree before a mutation succeeds.

## 1. Identities

| Identity | Issued by | Where it lives | Used for |
|---|---|---|---|
| **Customer** | Supabase Auth (email+password, magic link, OAuth-ready) | `users` row, `role = 'customer'` | Storefront, customer portal |
| **Staff** | Admin invitation | `users` row, `role = 'staff'` | Admin dashboard with limited write |
| **Admin** | Bootstrap on first deploy + invitation | `users` row, `role = 'admin'` | Full admin dashboard, AI action approval |
| **Service** | Supabase `service_role` key | Server-only env var | Supplier adapters, edge functions, AI service |
| **AI agent** | Application identity (never a JWT) | `actor_kind = 'ai_agent'` in `audit_log` | Cannot perform actions directly; submits proposals that admins approve |
| **Partner (M2M)** | Admin-issued API key pair | `partner_api_keys` row scoped to one `account_id` | Read the outbound inventory feed only ([`PARTNER-INVENTORY-API.md`](PARTNER-INVENTORY-API.md)) |

The `auth.users` row from Supabase Auth is mirrored into our `public.users` table by a trigger so that downstream tables can foreign-key to a single user identity.

## 2. JWT claims used by the client

The customer JWT carries the standard Supabase claims (`sub`, `email`, `role`) plus two custom claims, populated by a `before-token` hook in Supabase Auth:

- `account_id` — the active account context for the user.
- `tier_id` — the cached current tier for that account.

Custom claims let the frontend gate UI without a round-trip (e.g. show "Tier 3 prices" on the catalog) while the database **still** enforces the same gating via RLS. The JWT is **not** the source of truth — RLS policies always re-derive the tier from the `accounts` table.

## 3. Role mapping (DB layer)

```
anon          → unauthenticated visitors (catalog read-only)
authenticated → any signed-in user (`customer`, `staff`, `admin`)
service_role  → server-only key (no RLS — used by edge functions and adapters)
```

Inside `authenticated`, app-level role is read from `public.users.role` via a SECURITY DEFINER helper:

```sql
create or replace function public.current_user_role()
returns text
language sql stable
security definer
as $$
  select role from public.users where id = auth.uid() limit 1
$$;
```

Helper for "is this user a member of this account":

```sql
create or replace function public.is_account_member(_account_id uuid)
returns boolean
language sql stable
security definer
as $$
  select exists (
    select 1 from public.account_memberships
    where account_id = _account_id and user_id = auth.uid()
  )
$$;
```

## 4. Per-table RLS outline

> Policies are written in `supabase/migrations/0002_rls_policies.sql`. This table is the design contract.

| Table | Read | Write |
|---|---|---|
| `users` | `auth.uid() = id` OR admin/staff | Self can update own profile; admins can update role |
| `accounts` | members (`is_account_member`) OR admin/staff | members with role `owner`; admins |
| `account_memberships` | members of the same account OR admin/staff | account owners; admins |
| `tiers` | anyone (catalog needs it) | admin only |
| `price_rules` | admin/staff | admin only |
| `prices` | anyone (effective price display) | service_role only (refreshed by edge function) |
| `products` | anyone for `status='published'`; admin/staff for all | admin only |
| `product_variants` | anyone when parent published | admin only |
| `inventory_snapshots` | admin/staff | service_role only (suppliers) |
| `suppliers` | admin/staff | admin only |
| `supplier_sync_runs` | admin/staff | service_role only |
| `carts` | owner via account membership | owner; admin (rare, for support) |
| `cart_items` | owner via cart | owner; admin |
| `orders` | members of the account; admin/staff | account members `owner` or `buyer` create draft; transitions performed by admin/staff or edge functions |
| `order_items` | follows `orders` | service_role only (system-managed) |
| `shipments` | follows `orders` | service_role only |
| `payments` | follows `orders` (account members read; admin full) | service_role only (webhook) |
| `tickets` | members of the account; admin/staff | account members create; admin transitions |
| `ticket_messages` | follows `tickets` | author writes own; admin moderates |
| `ai_actions` | admin/staff | service_role (AI service inserts proposals); admin approves/rejects via app code |
| `audit_log` | admin only | service_role only |
| `inventory_locations` | admin/staff **only** | admin only — this is the supplier→"Texas Inventory" masking map; never account-readable |
| `partner_api_keys` | account owners see own rows **minus `secret_hash`** (via a view); admin/staff full | service_role only (admin issues via app code) |
| `partner_feed_subscriptions` | account owners see own rows minus `signing_secret*`; admin/staff full | service_role only |
| `partner_margin_rules` | admin/staff **only** | admin only — our margin is never account-readable |
| `partner_inventory_projection` | admin/staff; partners read **only via the API service**, never directly | service_role only |
| `partner_webhook_deliveries` | admin/staff; account owners see status columns of own subscription (no `payload`) | service_role only |

## 4.1 Partner (M2M) authentication

Distinct from §6's human flows and deliberately narrower.

1. `Authorization: Bearer <key_id>.<secret>`; the secret is verified against `secret_hash` (Argon2id, constant-time). Only `key_id` is ever logged.
2. `services/partner-api` resolves the key to an `account_id`, checks `revoked_at is null` and `expires_at`, then queries with `service_role` while applying the partner scope **in application code**.
3. **A partner key never becomes a session.** No customer JWT is minted, no cookie is set, no Supabase client is handed to the partner. There is no path from an API key to the storefront's authorization surface.
4. **Scope is strictly smaller than the account's human session:** inventory feed read-only. No orders, no PII, no carts, no tickets, no other account — not even the partner's own order history.
5. Revocation is immediate (`revoked_at`), checked on every request, no cache. Rotation is overlap-based: the new secret is issued while the old stays valid until `secret_rotated_until`, so partners rotate without downtime.
6. Rate limits are per `key_id` (120/min, 1000/h), enforced at the edge before the hash comparison so a brute-force attempt cannot burn CPU on Argon2.

**Blast radius of a leaked partner key:** that partner's own marked-up inventory feed. No PII, no orders, no cost data, no other tenant. The narrow scope *is* the control.

## 5. Cross-cutting policy invariants

- **No anon write.** No table accepts a write from the `anon` role.
- **No service_role on the client.** The `service_role` key never leaves the server.
- **Customer isolation.** A `customer` can never read or write rows belonging to another account, no matter how the request is shaped.
- **Staff vs admin.** `staff` can read all data and perform daily operations (order transitions, ticket replies) but cannot rotate roles, run financial reversals beyond a defined cap, or approve high-risk AI actions.
- **No write through views.** All writes go through tables; views are read-only.
- **Partner isolation.** An API key can only ever observe the projection computed for its own `account_id`. Cross-partner reads are blocked in the application scope *and* by RLS on `partner_inventory_projection`.
- **Cost and supplier identity never reach a partner.** Enforced by an outbound serializer allow-list, not by redaction — see [`PARTNER-INVENTORY-API.md`](PARTNER-INVENTORY-API.md) §7.

## 6. Authentication flows

### 6.1 Customer sign-up

1. Storefront calls Supabase Auth `signUp({ email, password })`.
2. Supabase sends a verification email; user clicks the link.
3. On first sign-in, a server hook:
   - Creates a `users` row mirroring `auth.users.id`.
   - Creates a default `accounts` row (`type='individual'`, tier = `tier_1`).
   - Creates an `account_memberships` row with role `owner`.
4. The customer JWT now carries `account_id` and `tier_id` claims.

### 6.2 Magic link

Identical to 6.1 but the password step is skipped; the same hooks run on first verified sign-in.

### 6.3 Admin invitation

1. Existing admin enters an email + role (`staff` or `admin`) in the dashboard.
2. Server creates a pending invitation row + sends a Supabase Auth invite.
3. Invitee accepts via the link; sign-up hook elevates `users.role` accordingly.

### 6.4 Password reset

Standard Supabase Auth flow; no custom code beyond rate-limiting on the storefront UI.

## 7. Session lifecycle & rotation

- Access token: 1h.
- Refresh token: 30d rotating.
- Sign-out invalidates both server-side (Supabase) and clears local storage.
- Sensitive admin actions (role change, refund > defined cap, manual tier override) require a fresh re-auth within 5 minutes — verified server-side.

## 8. Threats handled at the auth layer

| Threat | Mitigation |
|---|---|
| Credential stuffing | Supabase Auth password rules (length + breached-password check) + rate limits per IP at the edge |
| Session hijack via XSS | React + sanitized rich text only; no `dangerouslyInnerHTML` outside vetted islands |
| Privilege escalation via JWT tampering | RLS re-derives role from `public.users`; JWT claims are advisory for UI only |
| RLS bypass via service_role leak | Service key stored in VPS env + Supabase config; never in the client bundle; rotation procedure in [`OBSERVABILITY.md`](OBSERVABILITY.md) |
| Account takeover via lost device | Recovery flow + audit log + admin-initiated force-sign-out |
| AI agent forging actions | AI service uses `service_role` for **reads** only; actions are always proposals that an admin approves; RLS denies direct writes from an AI identity |

Cross-references: [`../security/THREAT-MODEL.md`](../security/THREAT-MODEL.md), [`../security/DATA-CLASSIFICATION.md`](../security/DATA-CLASSIFICATION.md).
