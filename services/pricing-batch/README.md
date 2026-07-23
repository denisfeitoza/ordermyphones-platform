# Pricing Batch (nightly)

> The **v2 pricing pipeline**. Runs nightly, prices every eligible SKU for all four tiers against a competitive benchmark, and persists the result to the catalog. The storefront and the outbound APIs then only ever **read** a pre-computed price.
>
> Design contract: [`../../docs/architecture/PRICING-ENGINE.md`](../../docs/architecture/PRICING-ENGINE.md).

## What's here

| Path | What it is |
|---|---|
| `reference/pricing_engine.py` | **Reference implementation** authored with the client (Abdu / OMP engineering, July 2026). Stdlib-only, stack-agnostic, pure function. The production job is wired from this — the reference is the contract for the math and the flag logic, and the source of the golden-file test. |

## Why a batch, not the edge function

The realtime `supabase/functions/pricing-engine` (v1) answers *"what does this cart cost at this tier, right now?"* by reading materialized prices. It does **not** compute prices.

This batch is what fills that table. Nightly it:

1. Ingests the day's vendor stock feeds → CTIA grades.
2. Fetches competitor quotes from five marketplace sources (eBay, Best Buy, Amazon Renewed, Walmart Restored, Back Market).
3. Runs the waterfall (`price_item`) per SKU → a price for each of the four tiers, plus per-tier visibility flags.
4. Publishes passing prices to the catalog; routes floor/grade/benchmark flags to the admin queue.

The two are complementary: **batch writes, edge function reads.** See the pipeline timeline in [`PRICING-ENGINE.md`](../../docs/architecture/PRICING-ENGINE.md) §7.

## Running the reference

```bash
python3 reference/pricing_engine.py   # runs the built-in demo (one HYLA row, five comps)
```

Dependency-free. `price_item(StockItem, [CompetitorQuote]) -> PriceResult` is pure — same inputs, same outputs — so the golden-file test diffs its output against an approved snapshot on every deploy.
