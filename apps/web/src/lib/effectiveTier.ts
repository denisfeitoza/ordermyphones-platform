import type { PricingTierCode } from '@shared/pricing';
import { useCatalogSource } from '@/lib/catalogSource';
import { useAuth, useTier } from '@/store';
import { TIERS, type TierDef } from '@/data/tiers';

/**
 * The tier to DISPLAY for the signed-in user. In real mode this is the account's
 * actual tier (public.profiles.tier), not the mock/preview tier store — so a
 * wholesale customer sees "Wholesale" everywhere, not the mock default
 * "Consumer". In mock mode it defers to useTier (which carries the demo's
 * client-side tier + the admin "view store as…" preview). Admins/staff have no
 * tier in real mode → `tierDef` is undefined and callers hide the badge; the
 * header chip is already customer-only, so the admin view-as lens is untouched.
 */
export function useEffectiveTier(): { tierDef: TierDef | undefined; code: PricingTierCode } {
  const source = useCatalogSource();
  const { profile } = useAuth();
  const mock = useTier();
  if (source === 'real') {
    const rd = profile?.tier ? TIERS.find((t) => t.label.toLowerCase() === profile.tier) : undefined;
    return { tierDef: rd, code: rd?.code ?? mock.code };
  }
  return { tierDef: mock.tier, code: mock.code };
}
