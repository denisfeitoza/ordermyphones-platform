# Test-ready v1 — what must be easy, functional and open for first real tests

> Client direction (2026-08-06): treat this as a final product now. Fix
> permissions, users (admin / staff / test users), let the admin navigate every
> lens (roles, tiers, users — "see what each of them sees"), get to the point
> of receiving the first signups with a beautiful catalog.

## 1. Role model (S1, first migration — non-negotiable)

| Role | Sees | Can |
|---|---|---|
| `admin` | Everything | Everything incl. panel config, invites, approvals, impersonation |
| `staff` | Admin console minus config/finance | Operate: import stock, approve orders, manage catalog |
| `customer` | Storefront + own portal, own tier's prices only | Order, manage own profile/addresses |

- `profiles.role` + RLS by role on every table. Sign-in routes by role
  (customer → portal, admin/staff → console). The account icon in the header
  goes to the RIGHT place per role — today everyone lands in /admin (mockup
  flaw, already documented).
- `/enter/:where` backdoor: **deleted** in v1.
- `profiles.is_test boolean` — test accounts are first-class (see §3).

## 2. Admin lenses — "see what each of them sees" ✅ partially shipped

- **Tier lens (SHIPPED in mockup, carries to v1):** admin topbar → "View
  store as… T1–T4" opens the storefront through that tier's eyes; floating
  pill hops tiers in one click and returns to admin. Preview is per-tab
  (sessionStorage) and never touches the assigned tier.
- **User lens (v1):** "View as customer" button on each customer row —
  renders the portal exactly as that account sees it (their tier, their
  orders, their addresses). Read-only lens: admin's own rights fetch the
  data, the UI applies the customer filter — no session swap, no auth
  trickery, nothing to leak. Banner + audit row (`admin X viewed as Y`).
- **Role lens (v1):** admin can open the staff view to verify what staff
  can/can't touch.

## 3. Test users & data hygiene (S1 seed)

- Seed script creates one known-password account per lens:
  `admin@test`, `staff@test`, `consumer@test`, `retailer@test`,
  `wholesale@test`, `distributor@test`, plus one pending-invite. All
  `is_test = true`.
- Reports/metrics exclude `is_test` rows by default (panel toggle to show).
- **"Reset test data" button** (admin panel, test accounts only): wipes test
  orders/movements, reseeds. Real data untouchable by this path.
- Test orders get a `TEST` watermark on picking sheets/exports so nothing
  ships by accident.

## 4. Environment clarity

- A discreet `TEST` environment badge when running against the test flag —
  nobody mistakes a rehearsal for production.
- Sentry (errors) + PostHog (behavior) wired from S1 — first-signup bugs are
  seen, not reported by the customer.

## 5. First-signups checklist (gate to invite real people)

- [ ] Invite e-mail delivers (Supabase native sender) and link expires sanely
- [ ] G0 signup < 1 minute (per REGISTRATION-FIELDS.md — name + password only)
- [ ] Role routing correct (customer never sees admin)
- [ ] Tier prices correct per lens (verified via §2 tier lens)
- [ ] Order → approval → deduct → reconciliation loop closes (J2)
- [ ] Audit ledger records every movement
- [ ] Password reset works end-to-end
- [ ] `/ops` public page: keep only if it stays anonymized, else retire

## 6. Beautiful catalog (S2 polish list)

- Canonical display-name builder from import data: "iPhone 11 Pro · 256GB ·
  Unlocked" (never raw vendor strings).
- **Customers never see vendor grades** (`DLS B+`): CTIA-consumer labels only
  ("Certified Pre-Owned · Grade A"); raw grade stays admin-side.
- Photo pipeline: upload per product + model-family placeholder fallback so
  no card ever renders imageless.
- Empty/low-stock states already good (audited); keep exact-qty + per-region
  breakdown (locked D2).
- Default sort "Featured" curated in the admin panel (pin models), not
  hardcoded.

## Shipped in the mockup today (works now, demo-ready)

1. Admin "View store as…" tier selector + floating preview pill (per-tab,
   price-verified: T3 $1,079 vs T1 $1,199 live hop).
2. Portal Settings actually saves (persists + "Saved ✓" feedback);
   notification toggles persist instantly.
3. Addresses persist across reloads; non-default addresses removable.
