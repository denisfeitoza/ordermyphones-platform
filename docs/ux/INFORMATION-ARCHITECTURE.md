# Information Architecture

> The top-level map of the Platform's UX. Built around the three audiences: visitor, customer, admin.

## 1. Surface map

```
ordermyphones.com
├── /                              Landing page
├── /catalog                       Filtered catalog
├── /p/:slug                       Product detail
├── /cart                          Cart
├── /checkout                      Stripe checkout
├── /auth/sign-in                  Sign-in
├── /auth/sign-up                  Sign-up
├── /auth/reset                    Reset password
├── /auth/callback                 OAuth / magic-link callback
├── /portal                        Customer portal home
│   ├── /portal/orders             Orders list
│   ├── /portal/orders/:id         Order detail with tracking
│   ├── /portal/tier               Tier progress dashboard
│   ├── /portal/addresses          Shipping/billing addresses
│   ├── /portal/payment-methods    Stripe-stored payment methods
│   └── /portal/settings           Profile, password, notifications
└── /admin                         Admin dashboard (staff + admin only)
    ├── /admin/customers           Customer list + detail
    ├── /admin/orders              Order list + detail
    ├── /admin/inventory           Owned stock + supplier sync visibility
    ├── /admin/prices              Tier rules + per-product overrides
    ├── /admin/api-logs            Supplier syncs + Stripe webhooks + AI actions
    ├── /admin/ai                  AI suggestions inbox (proposals)
    └── /admin/reports             Sales, supplier mix, tier distribution
```

## 2. Visitor journey

1. **Landing** sets value prop, social proof, and dual CTA: "Shop devices" (catalog) + "Reseller? Apply for tier pricing" (sign-up).
2. **Catalog** with filters (brand, model, color, storage, condition, price range, in-stock). Smart search box top-anchored.
3. **Product** with the 3D viewer slot (graceful 2D fallback), variant matrix, live stock, and tier-aware price overlay (sign-in CTA when anon).
4. **Cart** with retail prices and a "Sign in to see tier pricing" prompt when anonymous.
5. **Checkout** on Stripe.

## 3. Customer journey (authenticated)

- Same as visitor + portal access.
- Tier-aware prices applied throughout catalog and cart, computed live by the pricing engine.
- Portal home highlights: latest order status, tier progress, next-best action ("You are 8 units away from Tier 3").
- Quick reorder from any past order.

## 4. Operator (admin) journey

- Sign-in via the same Supabase Auth flow; staff/admin role activates `/admin/*`.
- **Customers** — search, view, override tier (with reason and optional expiry).
- **Orders** — list with filters, detail with timeline, transition actions, refund flow.
- **Inventory** — owned stock CRUD, supplier last-sync status, manual sync trigger, per-SKU drill-down.
- **Prices** — global tier rules, per-product overrides, per-variant overrides; effective-price preview for a hypothetical customer × cart.
- **API logs** — sync history, webhook deliveries, AI action audit trail.
- **AI inbox** — list of proposed actions; admin reviews and approves or rejects each.
- **Reports** — top KPIs.

## 5. Navigation rules

- **Mobile-first.** Bottom nav for the storefront on small screens (Home, Catalog, Cart, Portal). Top nav becomes a desktop horizontal bar at `md:` and above.
- **Visitor vs authenticated** state is reflected in the same nav; the entry point changes from "Sign in" to "Portal".
- **Admin** uses a left sidebar at `md:` and above; a hamburger drawer on small screens.

## 6. Page-level acceptance criteria (Phase 1 deliverable)

For each surface in §1, Phase 1 fixes:

- The content slots and their hierarchy.
- The interaction patterns (load states, empty states, error states).
- Accessibility annotations (heading structure, focus order, ARIA roles where needed).
- Responsive breakpoints (320, 375, 414, 768, 1024, 1440).

The detailed content lives in the Figma file linked from `docs/phases/phase-1-artifacts/`.

## 7. Cross-references

- [`CUSTOMER-PORTAL.md`](CUSTOMER-PORTAL.md)
- [`ADMIN-DASHBOARD.md`](ADMIN-DASHBOARD.md)
- [`../architecture/PRICING-ENGINE.md`](../architecture/PRICING-ENGINE.md) — what the cart shows and why.
- [`../phases/PHASE-3-FRONTEND-AND-PORTAL.md`](../phases/PHASE-3-FRONTEND-AND-PORTAL.md) — implementation phase.
