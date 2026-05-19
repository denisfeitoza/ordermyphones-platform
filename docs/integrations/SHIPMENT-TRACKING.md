# Shipment & Tracking

> Per Agreement §A.2, the shipment/tracking provider is agreed during the discovery phase. This document captures the architecture so the provider choice can be made late without reshaping code.

## 1. Two paths

- **Supplier-owned tracking.** When a supplier dispatches a dropship order, they return a carrier (`USPS`, `UPS`, `FedEx`, `DHL`, …) + tracking number. The Platform displays this directly and polls for status.
- **Carrier-direct API.** When the volume justifies a dedicated tracking integration (EasyPost, AfterShip, Shippo, etc.), the Platform uses a single adapter to normalize status across carriers.

In both paths the **`shipments`** table is the single source of truth visible to admins and customers.

## 2. Status normalization

Status values stored in `shipments.status`:

```
queued        – Order paid, shipment created, awaiting supplier dispatch.
in_transit    – Carrier scanned the parcel.
delivered     – Carrier marked delivered.
exception     – Address invalid, lost, damaged.
returned      – Returned to sender.
```

Carrier-specific event strings are kept in `shipments.last_event_raw` for forensic use; only the normalized status drives UI and business logic.

## 3. Polling cadence

- `every 30m` while `status = 'queued'` or `'in_transit'`.
- `every 4h` while `status = 'exception'` until resolved.
- No polling once `delivered` or `returned`.

When a carrier supports webhooks (EasyPost, AfterShip), polling is replaced by webhook subscriptions and the cadence falls to a reconciliation sweep `every 6h`.

## 4. Customer-facing UX

- The customer portal shows a status chip + a carrier link.
- For carriers with full tracking history, the portal renders a timeline (queued → in transit → out for delivery → delivered) with timestamps.
- Email + in-app notifications are sent on:
  - First scan (`in_transit`).
  - Out-for-delivery (when supported).
  - Delivered.
  - Exception.

## 5. Admin-facing UX

- Per-order timeline with the raw events expandable.
- Manual override (`Mark shipped`, `Mark delivered`, `Mark returned`) with a required note that goes into `audit_log`.
- Bulk export of shipments for ops review.

## 6. Returns

- Returns are initiated from the customer portal (within a window agreed in Phase 1, default 14 days).
- A `tickets` row is opened with kind `return`.
- Once approved by admin, the system either generates a return label (when the carrier API supports it) or instructs the customer to use a supplier-provided method.
- On scan-back at the supplier, `shipments.status` transitions to `returned`; the `orders` flow handles refund accounting via the Stripe path.

## 7. Phase-by-phase work

| Phase | Work |
|---|---|
| **Phase 1** | Decide on supplier-owned vs carrier-direct tracking. If carrier-direct, pick the provider; capture API keys; record in [`STRIPE.md`](STRIPE.md)-style env contract here. |
| **Phase 2** | Implement the `shipments` table, the poller, the supplier feed handlers; do not surface UI yet. |
| **Phase 3** | Ship the customer portal timeline, the admin shipment views, and the notification senders. |
| **Phase 4** | Production credentials; webhook subscriptions if applicable; runbook entry. |

## 8. Risks

| Risk | Mitigation |
|---|---|
| Supplier returns inaccurate tracking numbers (typos, wrong carrier) | Validation on intake; admin alert when a carrier API returns 404. |
| Carrier API rate limits during peak season | Per-carrier RPS cap; jittered backoff. |
| Webhook delivery failures (carrier-direct) | Polling reconciliation sweep every 6h closes any gap. |
| Customer expects real-time updates that the carrier does not provide | UI labels updates with "Carrier may take up to N hours to reflect status." |

## 9. Out of scope (v1)

- Label printing in-house.
- Customs documentation generation.
- Multi-leg international shipments beyond a single hop.
