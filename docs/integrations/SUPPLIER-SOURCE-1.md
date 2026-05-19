# Supplier Source #1 — Assurant

> **Role in the contract:** U.S.-based dropship / lifecycle services partner, one of the two API integrations contemplated by Agreement §1.4 and Schedule A.2.
>
> **Real supplier:** **[Assurant](https://www.assurant.com/)** — U.S. enterprise specializing in device protection, trade-in, certified pre-owned and lifecycle services. The exact API surface (sandbox + production) is confirmed during the Phase 1 supplier audit.
>
> **System code:** `source-1` — kept as a contract-level abstraction in [`supabase/migrations/0001_initial_schema.sql`](../../supabase/migrations/0001_initial_schema.sql) so swapping the underlying supplier never requires a schema change. The human-readable name lives in `suppliers.display_name`.

## 1. What this integration covers

- Real-time **catalog** retrieval (model, color, storage, condition, descriptions, images when available).
- Real-time **inventory** retrieval (per-variant available quantity, unit cost, currency).
- **Dropship fulfillment** dispatch (post an order, get back a shipment confirmation).
- **Order status updates** (shipment tracking lifecycle).

## 2. Service location

[`services/supplier-source-1/`](../../services/supplier-source-1/) — Python adapter that runs as its own container. Talks to Supabase via the `service_role` key. Exposes a small internal HTTP surface for the AI service to call on demand (e.g. "re-sync this SKU now") but is otherwise driven by `pg_cron`.

## 3. Transport strategy

The adapter is **hybrid**:

- **Primary:** authenticated REST endpoints documented by the supplier.
- **Fallback:** [Scrapling](https://github.com/D4Vinci/Scrapling) — undetectable Python scraper with **adaptive selectors** (auto-relocates elements when HTML changes), `Fetcher` for plain HTTP, `DynamicFetcher`/Playwright for JS-rendered pages, `StealthyFetcher`/camoufox for sites with bot detection.

The fallback is used only when:

1. A specific field the contract requires is not returned by the REST endpoint and is only available in the supplier's web UI; or
2. A REST endpoint is temporarily down and the data is critical (stock for a hot SKU).

Both transports write to the **same** internal adapter API; downstream code does not need to know which path was used.

## 4. Data flow

```
┌────────────────┐    REST (preferred)     ┌───────────────────────┐
│ Supplier API #1│◀───────────────────────▶│ supplier-source-1     │
└────────────────┘                         │   /sync/catalog       │
                                           │   /sync/inventory     │
┌────────────────┐    Scrapling fallback   │   /fulfill            │
│ Supplier portal│◀───────────────────────▶│   /tracking           │
└────────────────┘                         └──────────┬────────────┘
                                                      │ service_role
                                                      ▼
                                           ┌───────────────────────┐
                                           │ Supabase (Postgres)   │
                                           │  · products            │
                                           │  · product_variants    │
                                           │  · inventory_snapshots │
                                           │  · supplier_sync_runs  │
                                           │  · shipments           │
                                           └───────────────────────┘
```

## 5. Sync jobs and schedules

| Job | Frequency | Idempotent | Owns |
|---|---|---|---|
| `sync_catalog` | every 6h | yes (slug/sku natural keys) | `products`, `product_variants` upserts |
| `sync_inventory` | every 10m | yes (writes a new `inventory_snapshots` row per run) | `inventory_snapshots` |
| `sync_prices` | every 1h | yes | `prices` (rebuild via `pricing-engine` after) |
| `dispatch_order(order_id)` | on `order.status='paid'` | yes (Stripe-PI-derived idempotency key) | sends to supplier; opens a `shipments` row |
| `sync_tracking(shipment_id)` | every 30m while in transit | yes | updates `shipments` |

Every job acquires `pg_advisory_lock((supplier_id, kind))` to prevent overlapping runs.

## 6. Credentials & env

```env
SUPPLIER_1_API_BASE=https://<supplier-host>/api
SUPPLIER_1_API_KEY=<rotated; macOS Keychain in dev, VPS env in prod>
SUPPLIER_1_SHARED_SECRET=<HMAC signing if the supplier supports it>
SUPPLIER_1_SANDBOX=true|false
SUPABASE_URL=<...>
SUPABASE_SERVICE_ROLE_KEY=<...>     # required for adapter writes
SCRAPLING_USE_STEALTH=true          # camoufox when needed
SENTRY_DSN=<...>
LOG_LEVEL=info
```

`.env.example` ships in [`services/supplier-source-1/.env.example`](../../services/supplier-source-1/.env.example); real values live on the VPS (developer standard §12).

## 7. Phase-by-phase responsibilities

| Phase | What we do for this integration |
|---|---|
| **Phase 1** | Read the supplier's docs. Request sandbox credentials from the Client. Pull a real sample response. Document divergence from the spec. Decide which fields require Scrapling fallback. |
| **Phase 2** | Build the adapter: REST client, Scrapling fallback, sync jobs, fulfillment dispatcher, telemetry. Connect to Supabase. Write the integration tests. |
| **Phase 3** | Surface supplier health in the admin dashboard. Manual sync trigger and per-SKU drill-down. |
| **Phase 4** | Production credentials, production quotas verified, sandbox-to-prod parity test, runbook line item ([`OBSERVABILITY.md` §5.1](../architecture/OBSERVABILITY.md)). |

## 8. Risk register (integration-specific)

| Risk | Mitigation |
|---|---|
| Supplier HTML changes mid-engagement, breaking fallback | Scrapling adaptive selectors auto-relocate; CI re-runs a recorded fixture nightly to catch drift. |
| Supplier REST schema undocumented edge cases (e.g. missing `currency`) | Validation layer normalizes to `USD` only when explicitly stated; otherwise raises and writes a `supplier_sync_runs` partial. |
| Fulfillment dispatch double-sent | Idempotency key derived from `order.id` + `dispatch_attempt_n`; supplier-side dedup checked on response. |
| Rate limits | Per-job concurrency cap; backoff with jitter; circuit breaker after N consecutive 429s. |
| Sandbox vs production parity gap | Sandbox-to-prod checklist in [`PHASE-4 §2.2`](../phases/PHASE-4-QA-AND-DEPLOYMENT.md). |

## 9. Out of scope (for this integration)

- Returns / RMA via supplier API (handled by manual admin flow in v1).
- Cost-of-goods analytics beyond what is needed to display tier-aware prices.
- Multi-warehouse routing within a single supplier (single warehouse assumed at launch).

## 10. References

- Adapter source: [`services/supplier-source-1/src/supplier_source_1/`](../../services/supplier-source-1/src/supplier_source_1/)
- Scrapling: <https://github.com/D4Vinci/Scrapling>
- Sibling supplier doc: [`SUPPLIER-SOURCE-2.md`](SUPPLIER-SOURCE-2.md)
- Runbook entry: [`../architecture/OBSERVABILITY.md`](../architecture/OBSERVABILITY.md)
