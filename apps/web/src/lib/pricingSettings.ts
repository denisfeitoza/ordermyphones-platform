/**
 * Pure, testable validators + metadata for the public.pricing_settings keys
 * (seeded in 20260806120400_pricing_scaffold.sql). The admin Pricing panel
 * uses these to validate before writing — a bad value here would silently
 * mis-price real stock, so validation is server-shaped and per-key, never one
 * loose JSON textarea.
 *
 * Money is integer cents end-to-end. Fractions are 0..1. No float rounding is
 * done here — we validate the parsed JSON the admin is about to persist.
 */

export type PricingKind =
  | 'cents' //        non-negative integer number of cents
  | 'fraction' //     0..1 inclusive (a percentage cap / discount)
  | 'posint' //       integer >= 1
  | 'multiplier' //   number > 1 (fallback price multiplier)
  | 'bands' //        cost→markup band array
  | 'multipliers'; // CTIA-keyed multiplier object

export interface PricingKeyMeta {
  key: string;
  kind: PricingKind;
  label: string;
  help: string;
}

/** CTIA grades used by fallback_multipliers — mirrors public.ctia_grade. */
export const CTIA_GRADES = ['NEW', 'CPO', 'A', 'B', 'C', 'D'] as const;
export type CtiaGrade = (typeof CTIA_GRADES)[number];

/**
 * Every editable pricing_settings key, grouped for the UI. Keep in lock-step
 * with the seed in 20260806120400 — a key here with no DB row simply reads as
 * absent (the panel shows it once the admin first sets it).
 */
export const PRICING_KEYS: readonly PricingKeyMeta[] = [
  { key: 'retailer_min_margin_cents', kind: 'cents', label: 'Retailer minimum margin', help: 'Floor margin (cents) T2 must clear to stay visible.' },
  { key: 'kit_cost_premium_cents', kind: 'cents', label: 'Kit cost — premium', help: 'Added cost (cents) for premium-tier devices when kitting T1/T2 basis.' },
  { key: 'kit_cost_standard_cents', kind: 'cents', label: 'Kit cost — standard', help: 'Added cost (cents) for standard devices when kitting T1/T2 basis.' },
  { key: 'kit_premium_threshold_cents', kind: 'cents', label: 'Kit premium threshold', help: 'Cost (cents) at or above which the premium kit cost applies.' },
  { key: 'premium_cost_threshold_cents', kind: 'cents', label: 'Premium cost threshold', help: 'Cost (cents) that marks a device premium for band selection.' },
  { key: 'wholesale_pct_cap', kind: 'fraction', label: 'Wholesale % cap', help: 'Max markup as a fraction of cost for T3 (0..1).' },
  { key: 'distributor_pct_cap', kind: 'fraction', label: 'Distributor % cap', help: 'Max markup as a fraction of cost for T4 (0..1).' },
  { key: 'outlier_trim_pct', kind: 'fraction', label: 'Outlier trim %', help: 'Fraction of extreme cost samples trimmed before benchmarking (0..1).' },
  { key: 'locked_discount', kind: 'fraction', label: 'Locked-device discount', help: 'Multiplier (0..1) applied to a carrier-locked device price.' },
  { key: 'cost_change_review_pct', kind: 'fraction', label: 'Cost swing review %', help: 'Cost move (fraction) that holds a variant for review (cost_swing).' },
  { key: 'min_sources_high_confidence', kind: 'posint', label: 'Min sources (high confidence)', help: 'Distinct cost sources needed before a benchmark is high-confidence.' },
  { key: 'fallback_default_multiplier', kind: 'multiplier', label: 'Fallback default multiplier', help: 'Price = cost × this when no CTIA-specific multiplier applies (>1).' },
  { key: 'wholesale_bands', kind: 'bands', label: 'Wholesale bands', help: 'Cost→markup bands for T3. Ascending max_cost_cents; last entry null (unbounded).' },
  { key: 'distributor_bands', kind: 'bands', label: 'Distributor bands', help: 'Cost→markup bands for T4. Ascending max_cost_cents; last entry null (unbounded).' },
  { key: 'fallback_multipliers', kind: 'multipliers', label: 'Fallback multipliers', help: 'Per-CTIA price multiplier (>1) used when no benchmark exists.' },
] as const;

export const PRICING_KEY_META: Record<string, PricingKeyMeta> = Object.fromEntries(
  PRICING_KEYS.map((m) => [m.key, m]),
);

function isInteger(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n);
}

export interface Band {
  max_cost_cents: number | null;
  markup_cents: number;
}

/**
 * Validate a parsed JSON value for a pricing key. Returns null when valid, else
 * a human-readable error string. Pure — no I/O, safe to unit-test.
 */
export function validatePricingValue(kind: PricingKind, value: unknown): string | null {
  switch (kind) {
    case 'cents':
      if (!isInteger(value) || value < 0) return 'Must be a non-negative whole number of cents.';
      return null;
    case 'posint':
      if (!isInteger(value) || value < 1) return 'Must be a whole number ≥ 1.';
      return null;
    case 'fraction':
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) return 'Must be a fraction between 0 and 1.';
      return null;
    case 'multiplier':
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 1) return 'Must be a number greater than 1.';
      return null;
    case 'bands':
      return validateBands(value);
    case 'multipliers':
      return validateMultipliers(value);
    default:
      return 'Unknown value kind.';
  }
}

export function validateBands(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return 'Must be a non-empty array of bands.';
  let prevMax = -1;
  for (let i = 0; i < value.length; i++) {
    const b = value[i] as Partial<Band>;
    if (b === null || typeof b !== 'object') return `Band ${i + 1} must be an object.`;
    if (!isInteger(b.markup_cents) || (b.markup_cents as number) < 0) return `Band ${i + 1}: markup_cents must be a non-negative whole number.`;
    const isLast = i === value.length - 1;
    if (b.max_cost_cents === null) {
      if (!isLast) return 'Only the LAST band may have max_cost_cents = null (the unbounded top band).';
    } else {
      if (!isInteger(b.max_cost_cents) || (b.max_cost_cents as number) <= 0) return `Band ${i + 1}: max_cost_cents must be a positive whole number or null.`;
      if ((b.max_cost_cents as number) <= prevMax) return `Band ${i + 1}: max_cost_cents must strictly ascend.`;
      prevMax = b.max_cost_cents as number;
    }
  }
  if ((value[value.length - 1] as Band).max_cost_cents !== null) return 'The last band must have max_cost_cents = null (unbounded).';
  return null;
}

export function validateMultipliers(value: unknown): string | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return 'Must be an object keyed by CTIA grade.';
  const obj = value as Record<string, unknown>;
  for (const g of CTIA_GRADES) {
    const v = obj[g];
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 1) return `${g}: must be a number greater than 1.`;
  }
  const extra = Object.keys(obj).filter((k) => !(CTIA_GRADES as readonly string[]).includes(k));
  if (extra.length) return `Unexpected key(s): ${extra.join(', ')}. Only ${CTIA_GRADES.join('/')} are allowed.`;
  return null;
}
