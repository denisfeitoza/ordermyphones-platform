import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/**
 * Real-mode cart — the storefront's cart when app_settings.catalog_source is
 * 'real'. Holds ONLY {variantId, qty}: prices and stock are never trusted from
 * the client, so they are resolved at display time in the components that
 * already fetch the real catalog (RealCartDrawer, RealCheckout). Deliberately
 * PURE state + localStorage with ZERO network — Phase 4's contract is that mock
 * mode pays no round trip, and this provider mounts on every route.
 *
 * This lives ALONGSIDE the mock CartProvider (store/cart.tsx), which is left
 * byte-for-byte unchanged. The Header/checkout pick which cart to read from the
 * catalog-source flag, so the mock reserve flow never regresses.
 */
export interface RealCartLine {
  variantId: string;
  qty: number;
}

const STORAGE_KEY = 'omp_real_cart_v1';

function load(): RealCartLine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as RealCartLine[];
      if (Array.isArray(parsed)) {
        return parsed
          .filter((l) => l && typeof l.variantId === 'string' && Number.isFinite(l.qty) && l.qty > 0)
          .map((l) => ({ variantId: l.variantId, qty: Math.floor(l.qty) }));
      }
    }
  } catch {
    // ignore malformed storage
  }
  return [];
}

interface RealCartContextValue {
  lines: RealCartLine[];
  add: (variantId: string, qty?: number) => void;
  setQty: (variantId: string, qty: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
  unitCount: number;
  open: boolean;
  setOpen: (open: boolean) => void;
}

const RealCartContext = createContext<RealCartContextValue | null>(null);

export function RealCartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<RealCartLine[]>(() => load());
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // storage may be unavailable (private mode) — non-fatal
    }
  }, [lines]);

  const add = useCallback((variantId: string, qty = 1) => {
    const inc = Math.max(1, Math.floor(qty));
    setLines((prev) => {
      const existing = prev.find((l) => l.variantId === variantId);
      if (existing) return prev.map((l) => (l.variantId === variantId ? { ...l, qty: l.qty + inc } : l));
      return [...prev, { variantId, qty: inc }];
    });
    setOpen(true);
  }, []);

  const setQty = useCallback((variantId: string, qty: number) => {
    const next = Math.floor(qty);
    setLines((prev) =>
      next <= 0 ? prev.filter((l) => l.variantId !== variantId) : prev.map((l) => (l.variantId === variantId ? { ...l, qty: next } : l)),
    );
  }, []);

  const remove = useCallback((variantId: string) => setLines((prev) => prev.filter((l) => l.variantId !== variantId)), []);
  const clear = useCallback(() => setLines([]), []);

  const value = useMemo<RealCartContextValue>(
    () => ({
      lines,
      add,
      setQty,
      remove,
      clear,
      unitCount: lines.reduce((s, l) => s + l.qty, 0),
      open,
      setOpen,
    }),
    [lines, add, setQty, remove, clear, open],
  );

  return <RealCartContext.Provider value={value}>{children}</RealCartContext.Provider>;
}

export function useRealCart(): RealCartContextValue {
  const ctx = useContext(RealCartContext);
  if (!ctx) throw new Error('useRealCart must be used within <RealCartProvider>');
  return ctx;
}
