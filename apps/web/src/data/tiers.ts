import type { PricingTierCode } from '@shared/pricing';

/**
 * The 4 pricing tiers from the contract (Agreement §1.3 / scope §4).
 * Customers are auto-promoted as cumulative purchase volume grows, and a single
 * cart can lift the effective tier above the customer's stored tier.
 *
 * `discount` is the mock fraction off MSRP applied at this tier — the real
 * pricing engine (supabase/functions/pricing-engine) owns this server-side.
 */
export interface TierDef {
  code: PricingTierCode;
  label: 'Consumer' | 'Retailer' | 'Multi-Store' | 'Wholesale';
  short: string;
  minUnits: number;
  maxUnits: number | null;
  discount: number;
  /** suffix for the `tier-N` color tokens */
  tone: '1' | '2' | '3' | '4';
  rangeLabel: string;
}

export const TIERS: readonly TierDef[] = [
  { code: 'tier_1', label: 'Consumer', short: 'T1', minUnits: 1, maxUnits: 9, discount: 0, tone: '1', rangeLabel: '1–9 units' },
  { code: 'tier_2', label: 'Retailer', short: 'T2', minUnits: 10, maxUnits: 49, discount: 0.055, tone: '2', rangeLabel: '10–49 units' },
  { code: 'tier_3', label: 'Multi-Store', short: 'T3', minUnits: 50, maxUnits: 400, discount: 0.1, tone: '3', rangeLabel: '50–400 units' },
  { code: 'tier_4', label: 'Wholesale', short: 'T4', minUnits: 401, maxUnits: null, discount: 0.145, tone: '4', rangeLabel: '401+ units' },
] as const;

export function tierByCode(code: PricingTierCode): TierDef {
  const t = TIERS.find((x) => x.code === code);
  if (!t) throw new Error(`unknown tier ${code}`);
  return t;
}

/** Resolve the tier a given unit count falls into. */
export function resolveTierByUnits(units: number): TierDef {
  const u = Math.max(0, Math.floor(units));
  for (const t of TIERS) {
    if (u >= t.minUnits && (t.maxUnits === null || u <= t.maxUnits)) return t;
  }
  return TIERS[0];
}

/** The next tier up, or null if already at the top. */
export function nextTier(code: PricingTierCode): TierDef | null {
  const i = TIERS.findIndex((t) => t.code === code);
  return i >= 0 && i < TIERS.length - 1 ? TIERS[i + 1] : null;
}

/** Units still needed to reach the next tier from a current unit count. */
export function unitsToNextTier(units: number): { next: TierDef; remaining: number } | null {
  const current = resolveTierByUnits(Math.max(1, units));
  const up = nextTier(current.code);
  if (!up) return null;
  return { next: up, remaining: Math.max(1, up.minUnits - Math.max(1, units)) };
}

/** Pick the higher of two tiers (used to combine stored tier with cart-driven tier). */
export function maxTier(a: PricingTierCode, b: PricingTierCode): PricingTierCode {
  const ia = TIERS.findIndex((t) => t.code === a);
  const ib = TIERS.findIndex((t) => t.code === b);
  return ia >= ib ? a : b;
}
