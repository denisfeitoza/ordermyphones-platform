# Admin Dashboard

> The operator's cockpit (Agreement §1.6). Designed to be readable on the same laptop screen the operator uses all day; secondary support for tablet.

## 1. Surfaces

| Surface | Primary actions |
|---|---|
| Home (`/admin`) | KPIs (today's sales, fulfillment health, AI inbox count, latest tickets) |
| Customers (`/admin/customers`) | Search, detail, manual tier override |
| Orders (`/admin/orders`) | List, detail, status transitions, refund, fulfillment routing override |
| Inventory (`/admin/inventory`) | Owned stock CRUD, supplier health, manual sync trigger, per-SKU drill |
| Prices (`/admin/prices`) | Tier rules, per-product overrides, effective-price preview |
| API logs (`/admin/api-logs`) | Supplier sync history, Stripe webhook timeline, AI action audit |
| AI inbox (`/admin/ai`) | Proposed actions, approve/reject controls |
| Reports (`/admin/reports`) | Sales over time, top SKUs, supplier mix, tier distribution, conversion by tier |

## 2. Home (KPI snapshot)

- Cards: today's revenue, today's units, fulfillment-in-progress count, open tickets, AI proposals pending.
- A sparkline against the last 14 days under each card.
- Quick links to the relevant deep-dive screens.

## 3. Customers

- Filterable list (tier, status, last-order date, sign-up date).
- Customer detail:
  - Identity & contact (PII), tier card with override CTA.
  - Order history table; clickthrough to order detail.
  - Linked tickets and shipments.
  - Audit log subset (this customer's activity only).
  - "Suggest action" panels (AI buttons inline) when allowed.
- Tier override modal: target tier, reason (required), optional expiry; writes `audit_log` + `ai_actions` (kind `tier_override`, applied directly because admin-initiated).

## 4. Orders

- Filters: status, date range, account, supplier (where applicable), Stripe state.
- Order detail:
  - Items table with thumbnails, qty, unit price, supplier per item.
  - Totals, Stripe IDs, fulfillment timeline.
  - Action panel: transition status (with valid options), refund flow, fulfillment override (re-route a line to a different supplier with a reason).
  - Internal notes.
- Refund flow is two-step: amount + reason → confirm → Stripe API call → wait for webhook to finalize state.

## 5. Inventory

- Per-supplier health card (last sync, last error, row counts).
- "Sync now" button per supplier (rate-limited).
- Owned-stock list with CRUD (kept simple for v1; bulk import via CSV upload).
- Per-SKU drill-down shows the cross-supplier snapshot history, recent orders, and a manual adjustment action that goes through an audit-logged endpoint.

## 6. Prices

- Tier-by-tier rules with priority, scope (global / product / variant), kind (absolute, percentage off, margin floor), value.
- Effective-price preview tool: pick a variant + customer + qty → see the computed price + which rule applied.
- Margin-floor enforcement: when an admin sets a rule that would drop below a floor, the UI warns with a confirmation prompt.

## 7. API logs

- Three tabs: Supplier syncs, Stripe webhooks, AI actions.
- Each tab is a virtual-scrolled table with structured filters (status, time range).
- Click a row to see the raw payload (PII redacted unless the admin clicks "Show full payload" with a reason).
- "Replay" action available on Stripe webhooks for known-safe replay events.

## 8. AI inbox

- The hub for human-in-the-loop with the swarm.
- Each card shows the agent code, summary, structured diff, rationale, tool-call breadcrumbs, and Approve / Reject buttons.
- Approve writes the action and `audit_log`; Reject closes the proposal and asks for a short reason to feed back into the eval set.

## 9. Reports

- Sales over time (daily / weekly / monthly toggle).
- Top SKUs by units / revenue.
- Supplier mix (units fulfilled by each supplier).
- Tier distribution (number of accounts by tier).
- Conversion by tier (sessions → orders).
- All charts derive from Postgres views; PostHog provides the funnel deep-dives.

## 10. Permissions

| Action | Staff | Admin |
|---|---|---|
| Approve AI proposal (financial impact ≤ cap) | ✅ | ✅ |
| Approve AI proposal (above cap) | ❌ | ✅ |
| Tier override | ❌ | ✅ |
| Refund up to cap | ✅ | ✅ |
| Refund above cap | ❌ | ✅ |
| Edit tier rules | ❌ | ✅ |
| View audit log | ✅ | ✅ |
| Edit user roles | ❌ | ✅ |

Caps configured server-side and surfaced in the UI.

## 11. Mobile / tablet posture

- The dashboard is optimized for desktop; on tablet it remains usable; on phones it is read-only with a "Open on a larger screen for full controls" notice for write-heavy screens (Prices, Inventory bulk edits).
- Read-only screens (Orders, Customers, Reports) are fully responsive.

## 12. References

- [`INFORMATION-ARCHITECTURE.md`](INFORMATION-ARCHITECTURE.md)
- [`CUSTOMER-PORTAL.md`](CUSTOMER-PORTAL.md)
- [`../ai/AGENT-SWARM-OVERVIEW.md`](../ai/AGENT-SWARM-OVERVIEW.md)
- [`../architecture/AUTH-AND-RLS.md`](../architecture/AUTH-AND-RLS.md)
- [`../phases/PHASE-3-FRONTEND-AND-PORTAL.md`](../phases/PHASE-3-FRONTEND-AND-PORTAL.md)
