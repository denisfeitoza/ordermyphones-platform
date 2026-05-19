# tier-upgrade

Cumulative-units lifecycle. Re-evaluates an account's tier after every paid order and via a nightly `pg_cron` sweep. Implements promotion (immediate) and demotion (with grace period). See [`docs/architecture/PRICING-ENGINE.md` §5](../../../docs/architecture/PRICING-ENGINE.md).

Inputs:

```json
{ "account_id": "uuid", "trigger": "order_paid" | "nightly_sweep" }
```
