# Pricing Engine (v2)

> Deterministic, four-tier pricing driven by a **nightly competitive benchmark**, CTIA grade gating, kitting cost, and per-tier profit floors. All math runs in **integer cents** (the reference implementation uses dollars for readability; the production job is cents end-to-end).
>
> Two moving parts: a **nightly batch** ([`services/pricing-batch/`](../../services/pricing-batch/)) computes and persists a price per SKU × tier; the realtime **edge function** ([`supabase/functions/pricing-engine/`](../../supabase/functions/pricing-engine/)) only reads the caller's tier price. Batch writes, edge reads.
>
> Reference implementation: [`services/pricing-batch/reference/pricing_engine.py`](../../services/pricing-batch/reference/pricing_engine.py) — stdlib-only, pure function, runnable.

---

## 0. What changed from v1 (read this first)

v1 priced from admin-authored cost-plus / percentage `price_rules` and resolved a cart's tier as `max(stored_tier, cart_tier)`. v2 replaces the pricing **source** and **removes cart promotion**:

| | v1 | v2 |
|---|---|---|
| Consumer price basis | Admin cost-plus rule | **Market benchmark** — trimmed mean across 5 marketplaces, nightly |
| Tier resolution | `effective_tier = max(stored, cart)` | **Admin-assigned tier only.** Every SKU is priced at all four tiers; the customer sees the price for the tier their account holds. No cart-quantity promotion. |
| Grade handling | `condition` enum, cosmetic | **CTIA grade gate** — sub-A grades are hidden from consumer/retailer entirely |
| Failure mode | Missing price → 400 | Per-tier **flag** (hidden but never dead inventory) |

> ⚠️ **Contract note.** v1's cart-tier promotion was cited as **Agreement §1.3**. v2 drops it — this aligns the doc with what the live app already does (`store/tier.tsx`: "tier is ASSIGNED by the admin… the ONLY tier the customer ever sees"), but it **supersedes a cited clause** and should be confirmed via a Change Order (Agreement §8). The tier *thresholds* also move by one at the top (see §1).

---

## 1. The four tiers

| Tier | Qty band | Basis | Pricing rule | OMP profit floor |
|---|---|---|---|---|
| **T1 Consumer** | 1–9 | cost + kit | Market-average SRP (trimmed mean across sources) | $10.00 |
| **T2 Retailer** | 10–49 | cost + kit | Consumer − $20 (retailer nets $20 at OMP's price) | $5.00 |
| **T3 Wholesale** | 50–399 | bare HSO | Cost-plus band: +$7 / $10 / $12 / $15 | $2.50 |
| **T4 Distributor** | 400+ | bare HSO | Cost-plus band: +$3 / $4 / $5 / $6 | $1.00 |

> **Naming change from earlier docs.** Prior docs (and the live app) label T3 *Multi-Store* and T4 *Wholesale*. v2 renames them **Wholesale** (T3) and **Distributor** (T4), and the top boundary moves from 400/401 to **399/400**. Docs adopt v2; the app (`data/tiers.ts`, `TierBadge`) still uses the old labels — that divergence is tracked, see §10.

**Kitting.** Box + cable is baked into T1/T2 prices only (T3/T4 ship bare HSO — "handset only"): **$5** for Apple or vendor cost ≥ $300, else **$3**.

---

## 2. CTIA grade gating

The engine prices on **CTIA grade equivalence**, not on each vendor's own labels. One mapping table per vendor (`vendor_grade_map`) translates the vendor taxonomy into a CTIA grade; the gate then runs on CTIA.

| CTIA grade | HYLA vendor grades | T1/T2 (Consumer & Retailer) | T3/T4 (Wholesale & Distributor) |
|---|---|---|---|
| **A** · Like-New | `TPS A+`, `TPS A`, `DLS AA+` | ✅ Visible | ✅ Visible |
| **B** | `DLS A+` … `DLS B`, `TPS B+` | ❌ Hidden | ✅ Visible |
| **C** | `TPS B-` / `TPS C+` / `TPS C-`, `DLS C` | ❌ Hidden | ✅ Visible |
| **D** | `TPS D` | ❌ Hidden | ✅ Visible |
| **NEW / CPO** | (new & certified-pre-owned stock) | ✅ Visible | ✅ Visible |

Consumer-eligible = **NEW, CPO, A**. Everything below A is **wholesale/distributor only** — never dead inventory, just invisible to the two consumer tiers.

**Two things this reconciles / corrects:**
- It **supersedes** the letter-based grade→condition guess in [`PRODUCT-CATALOG-STANDARD.md`](PRODUCT-CATALOG-STANDARD.md) §3. `DLS A+`/`DLS A` are **CTIA B (not consumer-eligible)** — one full notch below `TPS A`. This reclassifies ~17% of the sample HYLA feed from "top used" to wholesale-only. Field experience, not letter arithmetic.
- **Supply reality (the 0.3% fact):** of 46,049 units in the July 21 HYLA feed, only ~148 carry a consumer-eligible grade. HYLA is a **volume (wholesale/distributor) source** — a consumer-facing storefront or partner (e.g. SmartPay) must get its depth from other vendors or CPO/new stock. See [`../integrations/SMARTPAY-INTEGRATION.md`](../integrations/SMARTPAY-INTEGRATION.md).

**Open item — orphan grade.** `TPS A-` is absent from both the reference map and the deck; `map_grade` defaults any unknown grade to **CTIA C** (safe: wholesale-only, logged). Confirm whether `TPS A-` should be A, B, or C before go-live rather than letting it silently default.

---

## 3. Competitive benchmark

Consumer price is the **trimmed mean of the market**, not a cost-plus markup. Five sources, pulled nightly:

| Source | Access | Cost | Role |
|---|---|---|---|
| eBay | Official Browse API | free | Used/refurb comps + sold prices |
| Best Buy | Official developer API | free | New-device SRP comps |
| Amazon Renewed | Aggregator API or Keepa | $50–100/mo | Primary used/refurb comp |
| Walmart Restored | Same aggregator | included | Secondary comp |
| Back Market | Scheduled scrape | $30–50/mo | Most direct consumer competitor |

Budget ~$150–200/mo with a second aggregator as failover.

**Calculation:**
1. Match comps on `model + capacity + condition equivalence` (+ lock status where exposed). Condition map maintained in admin.
2. Trim quotes beyond **±30%** of the median, then `benchmark = mean(remaining)`.
3. A **LOCKED** SKU with no locked comps matched → `benchmark × 0.90`.
4. **Confidence:** HIGH ≥ 3 distinct sources · LOW 1–2 (tagged for admin review) · NONE → fallback grade-multiplier pricing + flag.

Positioning is **mid-market**: OMP beats the *average* of the market, not every listing every day. Public claim is "competitive with the major marketplaces", never "always lowest".

---

## 4. The waterfall (per SKU)

Pure function `price_item(StockItem, [CompetitorQuote]) → PriceResult`:

1. **Map grade** vendor → CTIA.
2. **Kit cost** added to the T1/T2 basis (`total_cost = vendor_cost + kit`). T3/T4 use bare `vendor_cost`.
3. **T3/T4 first** — cost-plus bands, floored, **never competitively capped**. Premium devices (cost > $800) also get a percentage cap (T3 4%, T4 2.5%).
4. **Grade gate** — if CTIA < A (and not NEW/CPO): T1/T2 `HIDDEN_GRADE`, skip the benchmark entirely (**saves API tokens** — grade-gated SKUs never hit the paid pipeline). Return with T3/T4 priced.
5. **Benchmark** the consumer price. No comps → fallback multiplier + `FLAG_UNBENCHMARKED`.
6. **Consumer floor** — `benchmark − total_cost < $10` → `FLAG_MARGIN`, hidden from T1.
7. **Retailer** = `consumer − $20`; if that nets `< $5` over cost → `FLAG_MARGIN`, hidden from T2. Consumer hidden ⇒ retailer hidden.
8. **Tier-order validation** across *visible* tiers: `cost < T4 < T3 < T2 < T1`. Any violation → route to admin, **never publish**.

### Worked examples (real HYLA rows, from the reference impl)

| Case | Input | Result |
|---|---|---|
| **Healthy** | iPhone 17 256GB `DLS AA+`, cost $537, kit $542 | Comps trim to $722, locked ×0.90 → benchmark **$649.80** (HIGH). All four tiers live; consumer margin **$107.80**. |
| **Granular flag** | Galaxy Z Flip7, kitted $445, crashed market → benchmark $467 | T1 clears its floor at $22 margin, stays live; T2 would net $2 → **hidden from T2 only**. |
| **Grade gate** | iPhone 13 `TPS B+` → CTIA B | Hidden from T1/T2 automatically; priced $247 wholesale / $241 distributor. Skips the competitor pipeline. |

*(These paths are asserted in the test suite — see §8.)*

---

## 5. Flag queue (admin actions)

A flagged SKU is never dead — it stays live for the tiers it clears. The admin queue offers three actions, all audited:

- **Override** — manual price with a 30-day expiry. Every override lands in `audit_log`.
- **Acknowledge** — accept the flag; the SKU stays T3/T4-only until conditions change.
- **Watch** — auto-reprice nightly; the night the benchmark clears the floor, the SKU un-flags and re-enters consumer visibility with no human touch.

Every flag records `{ sku, vendor, cost, benchmark, gap_to_floor, sources_matched, timestamp }`.

---

## 6. Invariants (validated server-side)

- **Integer cents.** No float touches persisted money; the reference uses dollars for readability only.
- **Tier order** `cost < T4 < T3 < T2 < T1` on every published SKU. Violations never publish.
- **Grade gate is absolute.** A sub-A CTIA grade cannot appear in a T1/T2 price no matter what a benchmark or override says.
- **Floors are hard.** A tier whose margin is below its floor is hidden from that tier, not sold at a loss.
- **Guardrails carried from v1:** a day-over-day vendor cost change > 15% holds the SKU for review; zero-qty auto-delists; a multi-vendor SKU collision prices on the **lowest** cost.
- **Tier display is session-based** — derived from the account server-side, never from a URL param or cookie alone.

---

## 7. The nightly pipeline

```
02:00  Ingest     feeds → CTIA grades
02:30  Fetch      eligible SKUs only (grade-gated ones skip the paid comp fetch)
03:00  Benchmark  match · trim · mean
03:15  Waterfall  floors + per-tier flags
03:30  Publish    guardrails → catalog (materialized prices)
03:45  Digest     flag queue → admin
```

The realtime edge function then serves `prices` with a single index lookup — it never recomputes. Performance budget for the read path is unchanged: p50 < 80 ms, p99 < 250 ms on a warm cache.

---

## 8. Testing — three nets

1. **Unit tests** — the waterfall at cost $50 / $150 / $250 / $500 / $900 × every CTIA grade × locked/unlocked; benchmark trim with 0, 1, 2 outliers; flag transitions in **both** directions.
2. **Golden file** — run the engine on a snapshotted vendor feed + snapshotted quotes; diff against approved output on every deploy (the reference is a pure function, so this is exact).
3. **Tier-order assertion** — `cost < T4 < T3 < T2 < T1` on every SKU; violations never publish, always route to admin.

Proven against the reference implementation: healthy-SKU all-tiers-live, grade-gate hides consumer + skips benchmark, thin-margin floor flag, and the `TPS A-` unmapped→C default all pass.

---

## 9. Config — everything tunable lives in `CONFIG`

Floors, kit costs, markup bands, trim %, fallback multipliers, and the cost-change review threshold are all `CONFIG` values in the reference — no logic edits to retune. Review after **60–90 days** of live sales data. Onboarding a new vendor is one `vendor_grade_map` entry, not code.

---

## 10. Known divergence (doc vs. live app)

The live storefront (`apps/web/src/data/tiers.ts`, `TierBadge`, `tierStyles`) still uses the **v1 tier labels** — *Consumer / Retailer / Multi-Store / Wholesale* with a 401+ top boundary and a cosmetic `discount` fraction. This doc is v2 — *Consumer / Retailer / Wholesale / Distributor*, 400+ top, benchmark-driven. Renaming the app is a mechanical follow-up (labels + one boundary), deliberately **not** bundled into this spec change. Until it lands, treat this doc as the source of truth for the model and the app as pending alignment.

---

## 11. Related docs

- [`../../services/pricing-batch/`](../../services/pricing-batch/) — the reference implementation and the batch's home.
- [`PRODUCT-CATALOG-STANDARD.md`](PRODUCT-CATALOG-STANDARD.md) — grade taxonomy (now CTIA), the feed this prices.
- [`../integrations/SMARTPAY-INTEGRATION.md`](../integrations/SMARTPAY-INTEGRATION.md) — the first consumer-tier partner on this pricing.
- [`PARTNER-INVENTORY-API.md`](PARTNER-INVENTORY-API.md) — how a partner subscribes at a tier and receives these prices.
- [`DATA-MODEL.md`](DATA-MODEL.md) — `prices`, CTIA grade on variants, pricing flags.
- [`../integrations/STRIPE.md`](../integrations/STRIPE.md) — how a published price flows into checkout.
