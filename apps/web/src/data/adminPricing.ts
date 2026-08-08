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

/** Default markups over cost basis, per tier (distributor thinnest → consumer fattest). */
export const TIER_MARKUP: Record<DbTier, number> = { consumer: 1.4, retailer: 1.3, wholesale: 1.15, distributor: 1.08 };
