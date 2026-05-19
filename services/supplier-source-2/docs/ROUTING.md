# Routing — Supplier #2 (US dropship + Dubai wholesale)

> The decision matrix used by `routing.RoutingDecision.decide(...)` to pick the underlying feed that fulfills a given order item. Surfaced to the admin dashboard so the choice is never invisible.

## Decision order

1. **Stock availability gate.** A feed is eligible only if its latest `inventory_snapshots` row covers the required `qty`.
2. **SLA gate.** If the customer-side SLA is expedited and `ROUTING_EXPEDITED_DISABLE_DXB=true`, the Dubai feed is excluded.
3. **Quantity preference.** If `qty >= ROUTING_WHOLESALE_QTY_THRESHOLD` (default 100), prefer the wholesale (Dubai) feed.
4. **Landed-cost tie-break.** Compare `unit_cost_cents + freight_cents + duty_cents`. Lower wins.
5. **Default:** US dropship.

## Inputs

```py
RoutingInput(
    variant_id: str,
    qty: int,
    customer_account_id: str,
    expedited: bool,
)
```

## Output

```py
RoutingDecision(
    feed: Literal["source-2-us", "source-2-dxb"],
    rationale: str,
    eligible_feeds: list[str],
    chosen_at: datetime,
)
```

The rationale string is stored in `audit_log.after` for the order item. Admins can override a routing decision from the order detail view; the override is also audited.
