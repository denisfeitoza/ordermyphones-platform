# Supplier Source #2 — Mannapov LLC (with reserved Dubai wholesale slot)

> **Role in the contract:** Second of the two API integrations contemplated by Agreement §1.4 and Schedule A.2.
> **Real supplier — primary feed:** **[Mannapov LLC](https://buy.mannapovllc.com/)** — U.S.-based wholesale / dropship B2B portal.
> **Reserved second feed:** the Dubai wholesale supplier contemplated by Schedule A.2. **Name pending** — confirmed and wired during the Phase 1 supplier audit. Until then, the routing layer treats the Dubai slot as inactive and never routes orders to it.
> **System code:** `source-2` — kept as a contract-level abstraction (see [`supabase/migrations/0001_initial_schema.sql`](../../supabase/migrations/0001_initial_schema.sql)). The two underlying feeds live as `source-2-us` (Mannapov) and `source-2-dxb` (reserved).

## 1. What this integration covers

- Real-time **catalog and inventory** from Mannapov LLC today, with a hot-pluggable second feed for the Dubai wholesale supplier when Phase 1 names it.
- A **routing layer** that decides, per cart, which feed is fulfilling which line (today: only `source-2-us`; tomorrow: also `source-2-dxb`).
- A **fulfillment dispatcher** that adapts to each underlying feed's protocol (REST for Mannapov; REST · CSV · manual upload for the Dubai slot, depending on what the partner offers).
- **Order status updates** from each feed.

## 2. Why one adapter for two feeds

The contract counts **two API integrations** (Agreement §1.4) for **up to three feeds**. Building `source-2` as a consolidating adapter from day 1:

- Keeps the count honest — one API integration, multiple feeds behind it.
- Shares a common adapter shell (config, observability, lock helpers, Supabase writer).
- Hides the routing decision inside one service: downstream consumers see a single supplier identity (`source-2`) regardless of which underlying feed actually fulfills a given line.
- Makes adding the Dubai wholesale supplier in Phase 1 a configuration change, not a structural one.

## 3. Service location

[`services/supplier-source-2/`](../../services/supplier-source-2/) — Python adapter built like Source #1, with two `Feed` subclasses (`UsDropshipFeed`, `DubaiWholesaleFeed`) plugged into the same orchestrator.

## 4. Transport strategy per feed

| Feed | Primary transport | Fallback |
|---|---|---|
| `source-2-us` | Authenticated REST | Scrapling on the supplier portal (adaptive selectors) |
| `source-2-dxb` | Authenticated REST when the supplier offers one; otherwise CSV export + Scrapling on the supplier portal | Manual upload by admin (last-resort, audited) |

The Dubai wholesale feed in particular may operate semi-manually at launch; the adapter's Dubai feed class has an explicit **manual-upload** mode where an admin uploads a CSV in the admin dashboard and the adapter ingests it through the same idempotent path as the automated one.

## 5. Routing decision (which feed fulfills a given line)

The router runs at order-paid time and decides per `order_items[i]`:

1. **Quantity-first preference.** If a line's `qty` exceeds a configured threshold (default 100), prefer the wholesale (Dubai) feed.
2. **Margin-aware tie-break.** When both feeds can fulfill, compare landed cost (unit cost + estimated freight + import duty heuristic) and pick the lower.
3. **SLA-aware fallback.** Customer-side promised SLA (e.g. expedited shipping) excludes the slower wholesale feed.
4. **Stock-availability gate.** A feed is only eligible if its **latest** `inventory_snapshots` row covers the required qty.

The decision and the rationale are written into `order_items.supplier_id` and an `audit_log` entry — never silent.

## 6. Sync jobs and schedules

| Job | Frequency | Feed | Notes |
|---|---|---|---|
| `sync_catalog_us` | every 6h | `source-2-us` | upserts to `products`/`product_variants` |
| `sync_inventory_us` | every 10m | `source-2-us` | `inventory_snapshots` rows |
| `sync_catalog_dxb` | every 12h | `source-2-dxb` | slower cadence; wholesale data changes less frequently |
| `sync_inventory_dxb` | every 60m | `source-2-dxb` | `inventory_snapshots` rows |
| `dispatch_order_us(order_item_id)` | on `order.status='paid'` | `source-2-us` | dropship dispatch |
| `dispatch_order_dxb(order_item_id)` | on `order.status='paid'` | `source-2-dxb` | wholesale dispatch (may include a manual confirmation gate at launch) |
| `sync_tracking` | every 30m while in transit | both | updates `shipments` |

Cron schedules are offset against `source-1` so the supplier APIs are not hammered simultaneously.

## 7. Credentials & env

```env
SUPPLIER_2_API_BASE=https://<source-2-us-host>/api
SUPPLIER_2_API_KEY=<rotated>
SUPPLIER_2_SANDBOX=true|false

SUPPLIER_DUBAI_API_BASE=https://<source-2-dxb-host>/api   # optional if REST not available
SUPPLIER_DUBAI_API_KEY=<rotated>
SUPPLIER_DUBAI_MODE=rest|csv|manual

SUPPLIER_DUBAI_MANUAL_DROPBOX=/var/lib/source-2-dxb/inbox   # path on the VPS for CSV uploads

SUPABASE_URL=<...>
SUPABASE_SERVICE_ROLE_KEY=<...>
SCRAPLING_USE_STEALTH=true
SENTRY_DSN=<...>
LOG_LEVEL=info
```

## 8. Phase-by-phase responsibilities

Same shape as [`SUPPLIER-SOURCE-1.md`](SUPPLIER-SOURCE-1.md), with an additional Phase 1 deliverable: the routing decision matrix signed off by the Client.

## 9. Risk register (integration-specific)

| Risk | Mitigation |
|---|---|
| Dubai feed has no REST API and changes its CSV format silently | Schema-shape integration test on each ingest; `manual` mode requires an admin-initiated confirmation. |
| Currency handling differs (the Dubai feed may quote AED) | Adapter normalizes to USD using a configured FX rate snapshot; rate stored alongside the snapshot for forensic reproducibility. The contract restricts launch to USD (Schedule A.3) — Dubai feed costs must be expressed in USD before they reach the pricing engine. |
| Routing picks the slow wholesale feed for an order needing expedited SLA | SLA gate is part of routing; integration test covers each SLA × tier combination. |
| Manual mode opens a privilege loophole | CSV upload requires `admin` role + signed audit row; same content-shape validation as automated ingest. |
| Wholesale-fulfillment double-dispatch (manual + automated overlap) | Idempotency key on `order_item_id`; dispatch state machine prevents re-entry. |

## 10. Out of scope (for this integration)

- Multi-currency display at launch (Schedule A.3).
- Direct customer-to-Dubai shipping outside the routing layer.
- Returns flow against the Dubai feed (manual admin handling at launch).

## 11. References

- Adapter source: [`services/supplier-source-2/src/supplier_source_2/`](../../services/supplier-source-2/src/supplier_source_2/)
- Sibling supplier doc: [`SUPPLIER-SOURCE-1.md`](SUPPLIER-SOURCE-1.md)
- Routing decision matrix lives at: `services/supplier-source-2/docs/ROUTING.md` (created in Phase 1).
- Runbook entry: [`../architecture/OBSERVABILITY.md` §5.1](../architecture/OBSERVABILITY.md).
