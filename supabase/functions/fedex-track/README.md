# fedex-track

Refreshes carrier tracking for shipped orders and stores it in
`public.shipment_tracking` (see [`20260917120000_shipping_fedex.sql`](../../migrations/20260917120000_shipping_fedex.sql)).
Contract: [`docs/integrations/SHIPMENT-TRACKING.md`](../../../docs/integrations/SHIPMENT-TRACKING.md) §2–§3.

Deployed with `verify_jwt = false` because the sweep authenticates with a
shared secret; the per-order path requires the caller's JWT and reads the order
**as the caller**, so the order's own RLS policy decides visibility.

Inputs:

```json
{ "order_id": "uuid" }      // caller's user JWT (customer or staff)
{ "sweep": true }           // Authorization: Bearer $FEDEX_TRACK_SWEEP_SECRET
```

Only orders whose `tracking_carrier` matches /fedex/i are polled; anything else
returns `carrier_not_supported` and keeps the manual tracking number staff typed.
The sweep re-polls open statuses (`queued`, `in_transit`, `out_for_delivery`,
`exception`, `unknown`) once they are 30 minutes stale, 50 orders per run.

Writes are service-role: `shipment_tracking` has a read policy only, so this
function is the single author of tracking state. A failed poll is recorded on
the row (`poll_error`, `polled_at`) instead of being swallowed.

Env: `FEDEX_CLIENT_ID`, `FEDEX_CLIENT_SECRET`, `FEDEX_ACCOUNT_NUMBER`,
`FEDEX_API_BASE` (defaults to the sandbox host), `FEDEX_TRACK_SWEEP_SECRET`.
Missing FedEx credentials → `503 fedex_not_configured`, which the UI treats as
"feature off".
