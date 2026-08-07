import { describe, expect, it } from 'vitest';
import { validatePricingValue, validateBands, validateMultipliers, PRICING_KEY_META } from './pricingSettings';

describe('validatePricingValue — scalar kinds', () => {
  it('accepts a non-negative integer for cents, rejects negatives and floats', () => {
    expect(validatePricingValue('cents', 2000)).toBeNull();
    expect(validatePricingValue('cents', 0)).toBeNull();
    expect(validatePricingValue('cents', -1)).not.toBeNull();
    expect(validatePricingValue('cents', 12.5)).not.toBeNull();
    expect(validatePricingValue('cents', '2000')).not.toBeNull();
  });

  it('requires posint >= 1', () => {
    expect(validatePricingValue('posint', 3)).toBeNull();
    expect(validatePricingValue('posint', 0)).not.toBeNull();
    expect(validatePricingValue('posint', 1.5)).not.toBeNull();
  });

  it('bounds fractions to 0..1', () => {
    expect(validatePricingValue('fraction', 0)).toBeNull();
    expect(validatePricingValue('fraction', 0.04)).toBeNull();
    expect(validatePricingValue('fraction', 1)).toBeNull();
    expect(validatePricingValue('fraction', 1.01)).not.toBeNull();
    expect(validatePricingValue('fraction', -0.1)).not.toBeNull();
  });

  it('requires multiplier > 1', () => {
    expect(validatePricingValue('multiplier', 1.38)).toBeNull();
    expect(validatePricingValue('multiplier', 1)).not.toBeNull();
    expect(validatePricingValue('multiplier', 0.9)).not.toBeNull();
  });
});

describe('validateBands', () => {
  it('accepts an ascending band array ending in null (the seeded shape)', () => {
    expect(
      validateBands([
        { max_cost_cents: 10000, markup_cents: 700 },
        { max_cost_cents: 30000, markup_cents: 1000 },
        { max_cost_cents: 60000, markup_cents: 1200 },
        { max_cost_cents: null, markup_cents: 1500 },
      ]),
    ).toBeNull();
  });

  it('rejects a non-ascending max_cost_cents', () => {
    expect(
      validateBands([
        { max_cost_cents: 30000, markup_cents: 700 },
        { max_cost_cents: 10000, markup_cents: 1000 },
        { max_cost_cents: null, markup_cents: 1500 },
      ]),
    ).not.toBeNull();
  });

  it('requires the last band to be unbounded (null)', () => {
    expect(
      validateBands([
        { max_cost_cents: 10000, markup_cents: 700 },
        { max_cost_cents: 30000, markup_cents: 1000 },
      ]),
    ).not.toBeNull();
  });

  it('rejects a null max in a non-last position', () => {
    expect(
      validateBands([
        { max_cost_cents: null, markup_cents: 700 },
        { max_cost_cents: 30000, markup_cents: 1000 },
        { max_cost_cents: null, markup_cents: 1500 },
      ]),
    ).not.toBeNull();
  });

  it('rejects negative markup and empty arrays', () => {
    expect(validateBands([{ max_cost_cents: null, markup_cents: -1 }])).not.toBeNull();
    expect(validateBands([])).not.toBeNull();
  });
});

describe('validateMultipliers', () => {
  it('accepts every CTIA grade > 1', () => {
    expect(validateMultipliers({ NEW: 1.55, CPO: 1.5, A: 1.45, B: 1.38, C: 1.32, D: 1.2 })).toBeNull();
  });

  it('rejects a grade <= 1', () => {
    expect(validateMultipliers({ NEW: 1.55, CPO: 1.5, A: 1.45, B: 1.38, C: 1.32, D: 1.0 })).not.toBeNull();
  });

  it('rejects a missing grade and unexpected keys', () => {
    expect(validateMultipliers({ NEW: 1.55, CPO: 1.5, A: 1.45, B: 1.38, C: 1.32 })).not.toBeNull();
    expect(validateMultipliers({ NEW: 1.55, CPO: 1.5, A: 1.45, B: 1.38, C: 1.32, D: 1.2, X: 2 })).not.toBeNull();
  });
});

describe('PRICING_KEY_META registry', () => {
  it('maps known keys to a kind', () => {
    expect(PRICING_KEY_META.wholesale_bands?.kind).toBe('bands');
    expect(PRICING_KEY_META.retailer_min_margin_cents?.kind).toBe('cents');
    expect(PRICING_KEY_META.fallback_multipliers?.kind).toBe('multipliers');
  });
});
