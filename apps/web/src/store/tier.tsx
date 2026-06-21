import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { PricingTierCode } from '@shared/pricing';
import { tierByCode, type TierDef } from '@/data/tiers';

interface TierContextValue {
  tier: TierDef;
  code: PricingTierCode;
  setTier: (code: PricingTierCode) => void;
}

const TierContext = createContext<TierContextValue | null>(null);

/**
 * The visitor's stored tier. In production this comes from the account's
 * cumulative purchase volume; here it's switchable via the "View pricing as"
 * control so the B2B pricing is demonstrable without auth.
 */
export function TierProvider({ children }: { children: ReactNode }) {
  const [code, setCode] = useState<PricingTierCode>('tier_1');
  const value = useMemo<TierContextValue>(
    () => ({ tier: tierByCode(code), code, setTier: setCode }),
    [code],
  );
  return <TierContext.Provider value={value}>{children}</TierContext.Provider>;
}

export function useTier(): TierContextValue {
  const ctx = useContext(TierContext);
  if (!ctx) throw new Error('useTier must be used within <TierProvider>');
  return ctx;
}
