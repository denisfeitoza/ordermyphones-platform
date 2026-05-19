# services/supplier-source-1 — Assurant Adapter

Adapter for **Supplier API #1 — [Assurant](https://www.assurant.com/)** (Agreement §1.4, Schedule A.2). Implemented as a Python service that talks REST first and uses [Scrapling](https://github.com/D4Vinci/Scrapling) as an adaptive fallback when Assurant exposes only HTML or a field is missing from the REST response.

> **System code:** `source-1`. The folder name and code stay contract-abstract so swapping the supplier never requires a code-wide rename — the human-readable name lives in `suppliers.display_name` (currently `Assurant`).

## Why Scrapling

- **Adaptive selectors** — auto-relocate elements when the supplier changes their HTML. Survives layout drift without code changes.
- **Stealth fetchers** — `Fetcher` (plain), `DynamicFetcher` (Playwright), `StealthyFetcher` (camoufox) for bot-protected pages.
- **Async-first** with a typed Python API.

Install (the post-install step downloads the stealth browser bundles):

```bash
pip install -e ".[fetchers]"
scrapling install
```

## Local

```bash
cp .env.example .env
python -m venv .venv && source .venv/bin/activate
pip install -e ".[fetchers]"
scrapling install
python -m supplier_source_1.sync --dry-run
```

## Service surface

This adapter is driven by `pg_cron` jobs (and ad-hoc admin triggers). It owns:

- `sync_catalog` (every 6h) → upserts to `products`, `product_variants`.
- `sync_inventory` (every 10m) → appends to `inventory_snapshots`.
- `sync_prices` (every 1h) → refreshes `prices` (downstream pricing-engine recompute).
- `dispatch_order(order_id)` on `order.status='paid'` → sends to supplier; opens `shipments` row.
- `sync_tracking(shipment_id)` (every 30m while in transit) → updates `shipments`.

Each job acquires `pg_advisory_lock((supplier_id, kind))` to prevent overlap. Telemetry is written to `supplier_sync_runs`.

## Docker

```bash
docker build -t ordermyphones-supplier-source-1:dev .
docker run --rm --env-file .env ordermyphones-supplier-source-1:dev
```

## References

- Playbook: [`../../docs/integrations/SUPPLIER-SOURCE-1.md`](../../docs/integrations/SUPPLIER-SOURCE-1.md)
- Runbook: [`../../docs/architecture/OBSERVABILITY.md` §5.1](../../docs/architecture/OBSERVABILITY.md)
