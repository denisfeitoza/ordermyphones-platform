# Routing — Supplier #2 (Mannapov + reserved Dubai slot)

> The decision matrix used by `routing.RoutingDecision.decide(...)` to pick the underlying feed that fulfills a given order item. Surfaced to the admin dashboard so the choice is never invisible.
>
> **Status today:** only `source-2-us` (Mannapov LLC) is active. `source-2-dxb` is reserved for the Dubai wholesale supplier contemplated by Schedule A.2 and stays inactive in the routing layer until it is named in Phase 1. The decision tree below is the **steady-state** behavior once both feeds are live.

## Decision order

1. **Active-feed gate.** Inactive feeds (e.g. `source-2-dxb` before Phase 1 names it) are dropped from the eligible set up front.
2. **Stock availability gate.** A feed is eligible only if its latest `inventory_snapshots` row covers the required `qty`.
3. **SLA gate.** If the customer-side SLA is expedited and `ROUTING_EXPEDITED_DISABLE_DXB=true`, the Dubai feed is excluded.
4. **Quantity preference.** If `qty >= ROUTING_WHOLESALE_QTY_THRESHOLD` (default 100), prefer the wholesale (Dubai) feed.
5. **Landed-cost tie-break.** Compare `unit_cost_cents + freight_cents + duty_cents`. Lower wins.
6. **Default:** US dropship (Mannapov).

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
