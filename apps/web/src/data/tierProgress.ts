import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type DbTierName = 'consumer' | 'retailer' | 'wholesale' | 'distributor';
export const TIER_ORDER: DbTierName[] = ['consumer', 'retailer', 'wholesale', 'distributor'];

export interface TierProgress {
  units: number;
  tier: DbTierName | null;
  volumeTier: DbTierName;
  bands: Partial<Record<DbTierName, number>>;
}

/** Lifetime approved units and the tier that volume earns (my_tier_progress). */
export function useMyTierProgress(enabled = true) {
  return useQuery({
    queryKey: ['my-tier-progress'],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<TierProgress> => {
      const { data, error } = await supabase.rpc('my_tier_progress');
      if (error) throw new Error(error.message);
      const r = data as { units: number; tier: DbTierName | null; volume_tier: DbTierName; bands: Record<string, number> };
      return { units: Number(r.units), tier: r.tier, volumeTier: r.volume_tier, bands: r.bands as TierProgress['bands'] };
    },
  });
}

/** The next tier above `tier` and how many units it needs (null at the top). */
export function nextBand(p: TierProgress): { tier: DbTierName; at: number } | null {
  const i = TIER_ORDER.indexOf(p.tier ?? 'consumer');
  for (const t of TIER_ORDER.slice(i + 1)) {
    const at = p.bands[t];
    if (typeof at === 'number') return { tier: t, at };
  }
  return null;
}

export interface UpgradeCandidate {
  account_id: string;
  email: string;
  display_name: string | null;
  tier: DbTierName | null;
  units: number;
  volume_tier: DbTierName;
}

export function useTierUpgradeCandidates() {
  return useQuery({
    queryKey: ['tier-upgrade-candidates'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<UpgradeCandidate[]> => {
      const { data, error } = await supabase.rpc('tier_upgrade_candidates');
      if (error) throw new Error(error.message);
      return ((data ?? []) as UpgradeCandidate[]).map((r) => ({ ...r, units: Number(r.units) }));
    },
  });
}
