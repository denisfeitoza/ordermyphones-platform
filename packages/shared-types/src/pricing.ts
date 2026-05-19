/**
 * Pricing engine types. Mirrors the contract in
 * docs/architecture/PRICING-ENGINE.md.
 *
 * Money is integer cents end-to-end. No floats touch this path.
 */

export type PricingTierCode = 'tier_1' | 'tier_2' | 'tier_3' | 'tier_4';

export interface PricingTier {
  id: string;
  code: PricingTierCode;
  label: 'Consumer' | 'Retailer' | 'Multi-Store' | 'Wholesale';
  minUnits: number;
  maxUnits: number | null; // null for the unbounded top tier
}

export interface CartItemInput {
  variantId: string;
  qty: number; // must be >= 1
}

export interface PricingEngineInput {
  customerAccountId: string | null; // null for anonymous (guest) pricing
  cart: ReadonlyArray<CartItemInput>;
  currency: 'USD';
}

export interface PricedLine {
  variantId: string;
  qty: number;
  unitPriceCents: number;
  lineTotalCents: number; // unitPriceCents * qty (integer math)
  appliedRuleId: string | null;
}

export interface PricingDiagnostics {
  storedTierCode: PricingTierCode | null;
  cartUnitCount: number;
  promotionsApplied: ReadonlyArray<string>;
}

export interface PricingEngineOutput {
  effectiveTier: Pick<PricingTier, 'id' | 'code' | 'label'>;
  lines: ReadonlyArray<PricedLine>;
  subtotalCents: number; // sum(line.lineTotalCents) — exact
  currency: 'USD';
  diagnostics: PricingDiagnostics;
}
