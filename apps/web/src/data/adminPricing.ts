import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type DbTier = 'consumer' | 'retailer' | 'wholesale' | 'distributor';

export interface LocationCost {
  name: string;
  qty: number;
  cost_cents: number | null;
}

export interface PricingBreakdownRow {
  variant_id: string;
  sku: string;
  make: string;
  model: string;
  capacity: string;
  color: string | null;
  lock_status: 'locked' | 'unlocked';
  carrier: string;
  ctia_grade: string;
  total_qty: number;
  locations: LocationCost[];
  min_cost: number | null;
  max_cost: number | null;
  avg_cost: number | null;
  price_consumer: number | null;
  price_retailer: number | null;
  price_wholesale: number | null;
  price_distributor: number | null;
}

/** Admin pricing workbench: per-variant cost per location + current tier prices,
 * for a model/SKU search. Empty query returns the first page of the catalog. */
export function usePricingBreakdown(query: string) {
  return useQuery({
    queryKey: ['pricing-breakdown', query.trim()],
    queryFn: async (): Promise<PricingBreakdownRow[]> => {
      const { data, error } = await supabase.rpc('variant_pricing_breakdown', { p_query: query.trim() || null });
      if (error) throw new Error(error.message);
      return (data ?? []) as PricingBreakdownRow[];
    },
  });
}

/** Set (price_cents>0) or hide (null) one variant's price at one tier. */
export async function setTierPrice(variantId: string, tier: DbTier, priceCents: number | null): Promise<void> {
  const { error } = await supabase.rpc('set_tier_price', { p_variant_id: variantId, p_tier: tier, p_price_cents: priceCents });
  if (error) throw new Error(error.message);
}

/** A price an admin set by hand (source 'manual' / 'override'): the engine
 * never overwrites these, so they need watching when costs move. */
export interface ManualPriceRow {
  variantId: string;
  tier: DbTier;
  priceCents: number;
  basisCostCents: number | null;
  visible: boolean;
  name: string;
  sku: string;
}

interface RawManualPrice {
  variant_id: string;
  tier: DbTier;
  price_cents: number;
  basis_cost_cents: number | null;
  visible: boolean;
  variant: {
    sku: string;
    capacity: string;
    color: string | null;
    lock_status: string;
    product: { make: string; model: string } | null;
  } | null;
}

export function useManualPrices() {
  return useQuery({
    queryKey: ['manual-prices'],
    queryFn: async (): Promise<ManualPriceRow[]> => {
      const { data, error } = await supabase
        .from('prices')
        .select('variant_id, tier, price_cents, basis_cost_cents, visible, variant:product_variants ( sku, capacity, color, lock_status, product:products ( make, model ) )')
        .in('source', ['manual', 'override'])
        .limit(1000);
      if (error) throw new Error(error.message);
      return ((data ?? []) as unknown as RawManualPrice[])
        .filter((r) => r.variant?.product)
        .map((r) => ({
          variantId: r.variant_id,
          tier: r.tier,
          priceCents: r.price_cents,
          basisCostCents: r.basis_cost_cents,
          visible: r.visible,
          name: `${r.variant!.product!.model} · ${r.variant!.capacity}${r.variant!.color ? ' · ' + r.variant!.color : ''} · ${r.variant!.lock_status === 'unlocked' ? 'Unlocked' : 'Locked'}`,
          sku: r.variant!.sku,
        }))
        .sort((a, b) => Number(isBelowCost(b)) - Number(isBelowCost(a)) || a.name.localeCompare(b.name));
    },
  });
}

/** Sells under the cost basis the engine last recorded for this tier. */
export const isBelowCost = (r: Pick<ManualPriceRow, 'priceCents' | 'basisCostCents' | 'visible'>) =>
  r.visible && r.basisCostCents !== null && r.priceCents < r.basisCostCents;

/** Hand a manual wholesale/distributor/retailer price back to the engine. */
export async function revertTierPriceToAuto(variantId: string, tier: DbTier): Promise<void> {
  const { error } = await supabase.rpc('revert_tier_price_to_auto', { p_variant_id: variantId, p_tier: tier });
  if (error) throw new Error(error.message);
}

/** Default markups over cost basis, per tier (distributor thinnest → consumer fattest). */
export const TIER_MARKUP: Record<DbTier, number> = { consumer: 1.4, retailer: 1.3, wholesale: 1.15, distributor: 1.08 };
