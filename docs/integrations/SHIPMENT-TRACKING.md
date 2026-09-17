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

## 7. FedEx, as built (2026-09-17)

Carrier-direct, FedEx only, **sandbox-first**. Two edge functions share one
OAuth client ([`_shared/fedex.ts`](../../supabase/functions/_shared/fedex.ts));
the client id/secret never leave the server.

| Piece | Where |
|---|---|
| Tracking state per order | `public.shipment_tracking` — read by owner/account owner/staff, written only by the function (service role) |
| Warehouse origin address | `stock_locations.city/state_code/postal_code/country_code`, editable in Admin → Inventory → Locations |
| Parcel defaults | `app_settings.shipping_package_defaults` (unit weight, box weight, units per box, box inches) |
| Refresh tracking | [`fedex-track`](../../supabase/functions/fedex-track/README.md) — per order (caller's JWT) or a 30-min sweep (shared secret) |
| Rate estimate | [`fedex-rate`](../../supabase/functions/fedex-rate/README.md) — quotes every warehouse with a postal code, cheapest first |
| Customer UI | Tracking timeline on the portal order page; estimate under "Shipping" at checkout |
| Staff UI | Same timeline on the admin order drawer |

### Env contract (Supabase → Edge Functions → Secrets)

| Variable | Notes |
|---|---|
| `FEDEX_CLIENT_ID` / `FEDEX_CLIENT_SECRET` | From a project on developer.fedex.com. Sandbox keys are issued instantly. |
| `FEDEX_ACCOUNT_NUMBER` | The 9-digit account. Sandbox projects get a test account number. |
| `FEDEX_API_BASE` | Omit for sandbox (`https://apis-sandbox.fedex.com`); set `https://apis.fedex.com` for production. |
| `FEDEX_TRACK_SWEEP_SECRET` | Bearer token for the scheduled sweep only. |

With the credentials absent both functions answer `503 fedex_not_configured`
and the UI falls back to today's behaviour (manual tracking number, "Shipping —
arranged separately"). That is the state the code ships in.

### Deliberately not built

- **Label creation (Ship API).** FedEx requires label/solution validation before
  production, which is a human review of test shipments — it cannot be done in
  code. Still out of scope per §9.
- **Charging shipping.** The quote is an estimate; order totals remain tier
  price × qty (D4/D8), so `place_order` is untouched.
- **The 30-minute sweep schedule.** The function is deployed and takes
  `{sweep:true}`; wiring `pg_cron` (or any scheduler) to call it is a one-line
  follow-up once production keys exist.

## 8. Phase-by-phase work

| Phase | Work |
|---|---|
| **Phase 1** | Decide on supplier-owned vs carrier-direct tracking. If carrier-direct, pick the provider; capture API keys; record in [`STRIPE.md`](STRIPE.md)-style env contract here. |
| **Phase 2** | Implement the `shipments` table, the poller, the supplier feed handlers; do not surface UI yet. |
| **Phase 3** | Ship the customer portal timeline, the admin shipment views, and the notification senders. |
| **Phase 4** | Production credentials; webhook subscriptions if applicable; runbook entry. |

## 9. Risks

| Risk | Mitigation |
|---|---|
| Supplier returns inaccurate tracking numbers (typos, wrong carrier) | Validation on intake; admin alert when a carrier API returns 404. |
| Carrier API rate limits during peak season | Per-carrier RPS cap; jittered backoff. |
| Webhook delivery failures (carrier-direct) | Polling reconciliation sweep every 6h closes any gap. |
| Customer expects real-time updates that the carrier does not provide | UI labels updates with "Carrier may take up to N hours to reflect status." |

## 10. Out of scope (v1)

- Label printing in-house.
- Customs documentation generation.
- Multi-leg international shipments beyond a single hop.
