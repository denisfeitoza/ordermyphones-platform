# Pricing Engine

> Deterministic, tier-aware pricing. Lives in [`supabase/functions/pricing-engine/`](../../supabase/functions/pricing-engine/). All math runs in **integer cents**; no floats touch money.

## 1. Inputs and outputs

### Input

```ts
{
  customer_account_id: string;  // null for anonymous "guest" pricing
  cart: Array<{
    variant_id: string;
    qty: number;        // must be >= 1
  }>;
  currency: 'USD';
}
```

### Output

```ts
{
  effective_tier: {
    id: string;
    code: 'tier_1' | 'tier_2' | 'tier_3' | 'tier_4';
    label: string;
  };
  lines: Array<{
    variant_id: string;
    qty: number;
    unit_price_cents: number;
    line_total_cents: number;     // unit_price_cents * qty (integer math, no rounding)
    applied_rule_id: string | null;
  }>;
  subtotal_cents: number;
  currency: 'USD';
  diagnostics: {
    stored_tier_code: 'tier_1' | 'tier_2' | 'tier_3' | 'tier_4' | null;
    cart_unit_count: number;
    promotions_applied: string[];
  };
}
```

## 2. Tier resolution: stored tier vs cart tier

A customer has a **stored tier** in `accounts.tier_id`, set by the cumulative-units lifecycle (see §5 below). A specific cart can also **earn a tier** on its own, by total unit count. The pricing engine uses the **higher of the two**:

```
effective_tier = max(stored_tier, cart_tier)
```

| Stored | Cart units | Cart tier | Effective | Why |
|---|---|---|---|---|
| Tier 1 | 7 | Tier 1 | **Tier 1** | Both agree. |
| Tier 1 | 12 | Tier 2 | **Tier 2** | Cart promotes this transaction. |
| Tier 3 | 5 | Tier 1 | **Tier 3** | Customer keeps their earned tier on small carts. |
| Tier 2 | 410 | Tier 4 | **Tier 4** | Cart blasts past both. |

This is the **explicit contract** with the Client (Agreement §1.3). The customer can never be priced **worse** than their stored tier on a smaller cart.

## 3. Rule resolution per line

For each cart line `(variant_id, qty)`:

1. Look up the materialized price in `prices` for `(variant_id, effective_tier_id)`.
2. If a higher-priority `price_rules` entry applies (e.g. a time-bound promotion), it overrides — but only if it is **lower** than the materialized tier price (the engine never silently raises a price).
3. If no rule matches and no materialized price exists, return a **400 with a structured error** identifying the missing variant/tier pair — the admin must intervene. We never invent a price.

`priority` is consulted last. Order:

```
explicit variant rule > explicit product rule > tier materialized price > error
```

## 4. Invariants (validated server-side)

- `qty >= 1` per line; a `qty <= 0` is rejected (`400`).
- `unit_price_cents >= 1` always; the engine refuses to emit a free line unless a `free_sample` flag is set by an admin tool (out of scope for v1).
- `sum(line_total_cents) == subtotal_cents` exactly. No floating-point evaporation: per-unit prices are integer cents, multiplied by integer quantities.
- `subtotal_cents <= 2^53 - 1` (JS safe integer). The Platform also stores money in `bigint` on the DB side, so the JS limit is the constraining one — flagged for the client serialization layer.
- `effective_tier_id` is always one of the four configured tiers; the engine never produces an unknown tier.

## 5. Cumulative-units lifecycle (stored tier promotion / demotion)

Implemented by [`supabase/functions/tier-upgrade/`](../../supabase/functions/tier-upgrade/), called after every `paid` order:

1. Sum `qty` for the account across `orders.status in ('paid','fulfilling','shipped','delivered')` within the **lookback window** (default 12 months, agreed in Phase 1).
2. Subtract refunded units within the same window.
3. Map the resulting cumulative count to a tier via `tiers.min_units`.
4. If the new tier differs from `accounts.tier_id`:
   - Promotions are immediate.
   - Demotions have a **grace period** (default 30 days; signed off in Phase 1) before applying, to avoid yo-yo demotions across a refund-and-rebuy cycle.
5. Every transition is logged as an `audit_log` row and an `ai_actions` row with `agent_code = 'tier-classifier-agent'` (kind = `informational` when the system did the move autonomously).

## 6. Edge cases (signed off in Phase 1)

| Case | Behavior |
|---|---|
| Anonymous (guest) request | `effective_tier = Tier 1`; engine emits retail prices. |
| Account with no stored tier yet | Treated as Tier 1. |
| Mixed-supplier cart | Pricing math is supplier-agnostic; per-line `supplier_id` is set later by fulfillment routing. |
| Variant with no published price for the effective tier | `400` with `error_code = 'price_missing'`. UI shows "Contact sales for tier pricing." |
| Negative or zero quantity | Rejected (`400`). |
| Excessive cart (`> 10_000` units) | Allowed but logged for fraud review; pricing math still holds. |
| Concurrent cart edits from two devices | Last-write wins for the cart; pricing is always recomputed on the latest snapshot. |
| Refund after tier promotion | Demotion eligibility re-evaluated on next paid order or via nightly cron, respecting grace period. |
| Manual tier override by admin | Overrides the calculated stored tier; written to `audit_log`; expiry date optional. |

## 7. Performance budget

- p50 response time: **< 80 ms** on a warm cache.
- p99 response time: **< 250 ms**.
- Strategy:
  - Materialized `prices` table avoids per-request rule scans for the common case.
  - `effective_tier` resolution is a single index lookup on `accounts.tier_id` + a constant-time threshold check against `tiers.min_units`.
  - The function is invoked from the storefront via Supabase RPC; it has no external network call in the happy path.

## 8. Testing strategy

Unit and integration tests live in [`supabase/functions/pricing-engine/tests/`](../../supabase/functions/pricing-engine/) (added in Phase 2). The suite covers:

- Every tier boundary edge (`9`, `10`, `11`, `49`, `50`, `51`, `400`, `401`).
- Stored-vs-cart tier max function.
- Promotion rules that lower the price.
- Promotion rules that try to raise the price (rejected).
- Missing-price for a variant/tier combination.
- Negative qty, zero qty, huge qty.
- Mixed-supplier cart pricing parity.
- Demotion grace period.
- Manual tier override interaction with cart tier (override wins for downgrades, cart wins for upgrades).

## 9. Out of scope (v1)

- Coupon codes / discount codes.
- Promotional bundles that mix free + paid items.
- Currency-aware pricing beyond USD (Schedule A.3).
- Region-aware tax math — handled in the order layer via Stripe Tax in a later milestone.

## 10. Related docs

- [`DATA-MODEL.md`](DATA-MODEL.md) — fields used by the engine.
- [`AUTH-AND-RLS.md`](AUTH-AND-RLS.md) — who can read prices, who can write rules.
- [`../ai/AGENTS-ROSTER.md`](../ai/AGENTS-ROSTER.md) — `pricing-agent` and `tier-classifier-agent`.
- [`../integrations/STRIPE.md`](../integrations/STRIPE.md) — how the pricing engine output flows into a checkout session.
