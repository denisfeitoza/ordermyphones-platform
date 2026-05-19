# Customer Portal

> Self-service surface for registered customers (Agreement §1.7). The portal must feel like a tier-aware concierge, not a bare account screen.

## 1. Surfaces

| Surface | Purpose |
|---|---|
| Portal home (`/portal`) | At-a-glance: latest order, tier progress, recommended action |
| Orders (`/portal/orders`) | Full list with status, totals, supplier mix; clickthrough to detail |
| Order detail (`/portal/orders/:id`) | Items, totals, shipment timeline, invoice/receipt, "reorder" CTA |
| Tier dashboard (`/portal/tier`) | Current tier, units progress, history of promotions/demotions, "what unlocks at the next tier" |
| Addresses (`/portal/addresses`) | CRUD + default-shipping / default-billing flags |
| Payment methods (`/portal/payment-methods`) | Stripe-managed; add/remove/default |
| Settings (`/portal/settings`) | Profile, email/password, notifications (incl. **daily stock digest** opt-in) |

## 2. Tier-progress UX (signature feature)

- A horizontal progress bar with four labeled stops (Consumer, Retailer, Multi-Store, Wholesale).
- Current tier filled; next tier's stop highlighted; below the bar: "You are **8 units** away from **Retailer** pricing."
- Hovering / tapping the next tier opens a side panel: "At Retailer you save approximately X% on iPhone 15 Pro Max."
- Demotion warnings appear inline when applicable: "Your refund last week put you within the grace period; your tier will be reviewed on 2026-06-15." (Date derived from [`../architecture/PRICING-ENGINE.md`](../architecture/PRICING-ENGINE.md) §5.)

## 3. Order detail UX

- Timeline (queued → in transit → delivered) with timestamps and the carrier link.
- Items table with thumbnails, qty, unit price at order time, line total.
- Totals breakdown (subtotal, shipping, tax (0 at launch), total).
- "Download invoice / receipt" button (PDF generated server-side, prompt-cached).
- "Reorder" button reapplies current pricing through the pricing engine, not the historic prices.
- Refund / return CTA when in policy window (handled by `tickets` flow).

## 4. Empty / error states

- No orders yet → friendly "Browse the catalog" CTA + featured collections card.
- Order in `exception` shipment state → callout box with carrier note and "Contact support" CTA that opens a pre-filled ticket.
- Tier downgrade in grace period → "Heads up" callout; never a punitive tone.

## 5. Mobile-first specifics

- Sticky header collapsed to logo + portal title on scroll.
- Tier progress bar adapts to a vertical step-list at < 360px width.
- Action buttons sized ≥ 44px tap target.
- All forms use single-column layout on mobile; tab order matches visual order.

## 6. Accessibility checklist (verified in Phase 3)

- Semantic landmarks: `<header>`, `<main>`, `<nav>`, `<aside>` where relevant.
- Heading levels in order (no jumping `h2 → h4`).
- All interactive elements reachable by keyboard; visible focus.
- Color contrast 4.5:1 minimum for text; 3:1 for large text and UI components.
- Form errors announced via `aria-live="polite"`.
- The 3D viewer (when present) ships with a 2D fallback and a textual description.

## 7. State & data layer

- `TanStack Query` manages all server state; mutations use optimistic updates only where a rollback is cheap (e.g. setting a default address).
- Realtime updates (order status, shipment events) subscribe via Supabase Realtime channels filtered by `account_id` from the JWT claim.
- Tier changes propagate through the same channel.

## 8. References

- [`INFORMATION-ARCHITECTURE.md`](INFORMATION-ARCHITECTURE.md)
- [`ADMIN-DASHBOARD.md`](ADMIN-DASHBOARD.md)
- [`../architecture/PRICING-ENGINE.md`](../architecture/PRICING-ENGINE.md)
- [`../phases/PHASE-3-FRONTEND-AND-PORTAL.md`](../phases/PHASE-3-FRONTEND-AND-PORTAL.md)
