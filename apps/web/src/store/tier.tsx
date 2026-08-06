import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { PricingTierCode } from '@shared/pricing';
import { tierByCode, type TierDef } from '@/data/tiers';

const STORAGE_KEY = 'omp_tier_v1';
const PREVIEW_KEY = 'omp_tier_preview_v1';

function loadTier(): PricingTierCode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && /^tier_[1-4]$/.test(raw)) return raw as PricingTierCode;
  } catch {
    // ignore
  }
  return 'tier_1';
}

// Preview lives in sessionStorage: per-tab, gone when the tab closes,
// and it never overwrites the assigned tier.
function loadPreview(): PricingTierCode | null {
  try {
    const raw = sessionStorage.getItem(PREVIEW_KEY);
    if (raw && /^tier_[1-4]$/.test(raw)) return raw as PricingTierCode;
  } catch {
    // ignore
  }
  return null;
}

interface TierContextValue {
  /** Effective tier — the preview lens when active, else the assigned tier. */
  tier: TierDef;
  code: PricingTierCode;
  /** The tier actually assigned to the account (admin → Customers). */
  assignedCode: PricingTierCode;
  /** Admin-only: assign the customer's tier from the admin console. */
  setTier: (code: PricingTierCode) => void;
  /** Admin "view as": non-null while previewing the store through a tier's eyes. */
  previewCode: PricingTierCode | null;
  startPreview: (code: PricingTierCode) => void;
  stopPreview: () => void;
}

const TierContext = createContext<TierContextValue | null>(null);

/**
 * The customer's pricing tier. It is ASSIGNED by the admin (admin → Customers),
 * persisted, and is the ONLY tier the customer ever sees — other tiers are never
 * exposed customer-side. No cart-quantity or cumulative-volume auto-upgrade.
 *
 * Admins can additionally activate a per-tab PREVIEW ("view store as tier X"):
 * every tier-aware surface renders through that lens until the preview ends.
 */
export function TierProvider({ children }: { children: ReactNode }) {
  const [assignedCode, setAssignedCode] = useState<PricingTierCode>(() => loadTier());
  const [previewCode, setPreviewCode] = useState<PricingTierCode | null>(() => loadPreview());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, assignedCode);
    } catch {
      // storage may be unavailable — tier still holds in memory
    }
  }, [assignedCode]);

  useEffect(() => {
    try {
      if (previewCode) sessionStorage.setItem(PREVIEW_KEY, previewCode);
      else sessionStorage.removeItem(PREVIEW_KEY);
    } catch {
      // ignore
    }
  }, [previewCode]);

  const value = useMemo<TierContextValue>(() => {
    const code = previewCode ?? assignedCode;
    return {
      tier: tierByCode(code),
      code,
      assignedCode,
      setTier: setAssignedCode,
      previewCode,
      startPreview: setPreviewCode,
      stopPreview: () => setPreviewCode(null),
    };
  }, [assignedCode, previewCode]);
  return <TierContext.Provider value={value}>{children}</TierContext.Provider>;
}

export function useTier(): TierContextValue {
  const ctx = useContext(TierContext);
  if (!ctx) throw new Error('useTier must be used within <TierProvider>');
  return ctx;
}
