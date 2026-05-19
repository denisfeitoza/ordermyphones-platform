# services/supplier-source-2 — Supplier API #2 Adapter (Consolidated US + Dubai)

Adapter for **Supplier API #2** (Agreement §1.4, Schedule A.2). Distinct from `source-1`: this single integration consolidates two underlying feeds — the second U.S.-based dropship provider and the Dubai-based wholesale supplier — behind one logical source. The contract counts **two API integrations** for **three feeds**; the consolidation is what keeps that promise honest.

> **Placeholder names:** `source-2-us`, `source-2-dxb`. Replaced with real supplier names after the Phase 1 audit.

## Why consolidate

- Shared adapter shell (config, observability, lock helpers, Supabase writer).
- Per-order routing decision (US dropship vs Dubai wholesale) hidden inside this service.
- Downstream consumers see one supplier identity (`source-2`) with two sub-feeds.

## Local

```bash
cp .env.example .env
python -m venv .venv && source .venv/bin/activate
pip install -e ".[fetchers]"
scrapling install
python -m supplier_source_2.sync --kind inventory --dry-run
```

## Feeds

| Feed | Class | Mode | Notes |
|---|---|---|---|
| `source-2-us` | `feeds.us_dropship.UsDropshipFeed` | REST + Scrapling fallback | Dropship dispatch supported |
| `source-2-dxb` | `feeds.dubai_wholesale.DubaiWholesaleFeed` | REST · CSV · manual | Wholesale; may operate semi-manually at launch |

The Dubai feed supports a **manual-upload** mode (CSV dropped into `SUPPLIER_DUBAI_MANUAL_DROPBOX`) for early-stage launches; the same idempotent ingest path is used.

## Routing

`routing.RoutingDecision.decide(order_item)` returns which underlying feed fulfills a given order line. Decision factors (in order):

1. Quantity preference (≥ threshold → wholesale).
2. Landed cost (unit cost + freight + duty heuristic) — lower wins.
3. SLA-aware fallback (expedited shipping excludes the slower wholesale feed).
4. Stock availability gate.

Decision + rationale are written into `order_items.supplier_id` and `audit_log` — never silent. See [`docs/ROUTING.md`](docs/ROUTING.md).

## Docker

```bash
docker build -t ordermyphones-supplier-source-2:dev .
docker run --rm --env-file .env ordermyphones-supplier-source-2:dev
```

## References

- Playbook: [`../../docs/integrations/SUPPLIER-SOURCE-2.md`](../../docs/integrations/SUPPLIER-SOURCE-2.md)
- Sibling: [`../supplier-source-1/`](../supplier-source-1/)
