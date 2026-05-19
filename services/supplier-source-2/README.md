# services/supplier-source-2 — Mannapov LLC Adapter (with reserved DXB slot)

Adapter for **Supplier API #2 — [Mannapov LLC](https://buy.mannapovllc.com/)** (Agreement §1.4, Schedule A.2). Distinct from `source-1`: this single integration is built to host **two feeds** — Mannapov (US wholesale/dropship, active today) and the Dubai wholesale supplier contemplated by Schedule A.2 (reserved slot, name pending Phase 1 audit) — behind one logical source. The contract counts **two API integrations** for **up to three feeds**; the consolidation is what keeps that promise honest.

> **System codes:** `source-2-us` (Mannapov), `source-2-dxb` (reserved). Until the Dubai supplier is named in Phase 1, the routing layer treats the `source-2-dxb` slot as inactive.

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

| Feed | Maps to | Class | Mode | Notes |
|---|---|---|---|---|
| `source-2-us` | **Mannapov LLC** (active) | `feeds.us_dropship.UsDropshipFeed` | REST + Scrapling fallback | Dropship dispatch supported |
| `source-2-dxb` | Dubai wholesale (**reserved — name pending Phase 1**) | `feeds.dubai_wholesale.DubaiWholesaleFeed` | REST · CSV · manual | Wholesale slot; routing treats it as inactive until enabled |

The Dubai slot supports a **manual-upload** mode (CSV dropped into `SUPPLIER_DUBAI_MANUAL_DROPBOX`) for early-stage launches; the same idempotent ingest path is used. The slot stays cold (no routing traffic, no sync cron) until Phase 1 names the supplier and provides credentials.

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
