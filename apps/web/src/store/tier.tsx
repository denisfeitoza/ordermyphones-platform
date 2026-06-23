import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { PricingTierCode } from '@shared/pricing';
import { tierByCode, type TierDef } from '@/data/tiers';

const STORAGE_KEY = 'omp_tier_v1';

function loadTier(): PricingTierCode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && /^tier_[1-4]$/.test(raw)) return raw as PricingTierCode;
  } catch {
    // ignore
  }
  return 'tier_1';
}

interface TierContextValue {
  tier: TierDef;
  code: PricingTierCode;
  /** Admin-only: assign the customer's tier from the admin console. */
  setTier: (code: PricingTierCode) => void;
}

const TierContext = createContext<TierContextValue | null>(null);

/**
 * The customer's pricing tier. It is ASSIGNED by the admin (admin → Customers),
 * persisted, and is the ONLY tier the customer ever sees — other tiers are never
 * exposed customer-side. No cart-quantity or cumulative-volume auto-upgrade.
 */
export function TierProvider({ children }: { children: ReactNode }) {
  const [code, setCode] = useState<PricingTierCode>(() => loadTier());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch {
      // storage may be unavailable — tier still holds in memory
    }
  }, [code]);

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
