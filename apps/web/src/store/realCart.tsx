import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';

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
/** A per-location split of a line's quantity (M2-P3). Present only when the
 * customer explicitly allocates via the cart picker; absent = system decides
 * sourcing at approval (v1). When present it is all-or-nothing: the sum equals
 * the line qty (enforced in the picker + re-validated server-side). */
export interface RealCartAllocation {
  locationId: string;
  qty: number;
}

export interface RealCartLine {
  variantId: string;
  qty: number;
  allocations?: RealCartAllocation[] | undefined;
}

/**
 * Storage is scoped per signed-in user (audit 2026-09-13 P0-2): a cart built
 * by user A must not be inherited by user B on the same browser. The anonymous
 * cart lives under its own key and is merged into the user's cart on sign-in.
 */
const STORAGE_PREFIX = 'omp_real_cart_v2';
const ANON = 'anon';
const storageKey = (uid: string | null) => `${STORAGE_PREFIX}:${uid ?? ANON}`;

function sanitizeAllocations(a: unknown): RealCartAllocation[] | undefined {
  if (!Array.isArray(a)) return undefined;
  const clean = a
    .filter((x): x is RealCartAllocation => !!x && typeof x.locationId === 'string' && Number.isFinite(x.qty) && x.qty > 0)
    .map((x) => ({ locationId: x.locationId, qty: Math.floor(x.qty) }));
  return clean.length ? clean : undefined;
}

function load(uid: string | null): RealCartLine[] {
  try {
    const raw = localStorage.getItem(storageKey(uid));
    if (raw) {
      const parsed = JSON.parse(raw) as RealCartLine[];
      if (Array.isArray(parsed)) {
        return parsed
          .filter((l) => l && typeof l.variantId === 'string' && Number.isFinite(l.qty) && l.qty > 0)
          .map((l) => ({ variantId: l.variantId, qty: Math.floor(l.qty), allocations: sanitizeAllocations(l.allocations) }));
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
  setAllocations: (variantId: string, allocations: RealCartAllocation[] | undefined) => void;
  remove: (variantId: string) => void;
  clear: () => void;
  unitCount: number;
  open: boolean;
  setOpen: (open: boolean) => void;
}

const RealCartContext = createContext<RealCartContextValue | null>(null);

export function RealCartProvider({ children }: { children: ReactNode }) {
  // The cart starts as the anonymous cart; the auth listener below swaps it
  // for the user's own cart as soon as the session is known.
  const [uid, setUid] = useState<string | null>(null);
  const [lines, setLines] = useState<RealCartLine[]>(() => load(null));
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(uid), JSON.stringify(lines));
    } catch {
      // storage may be unavailable (private mode) — non-fatal
    }
  }, [lines, uid]);

  // Follow the auth session: on sign-in, merge the anonymous cart into the
  // user's saved cart (and clear the anon one); on sign-out, drop back to an
  // EMPTY anonymous cart so nothing of the previous user lingers on screen.
  useEffect(() => {
    let current: string | null = null;
    const apply = (nextUid: string | null) => {
      if (nextUid === current) return;
      current = nextUid;
      if (nextUid) {
        const own = load(nextUid);
        const anon = load(null);
        const merged = [...own];
        for (const l of anon) {
          const existing = merged.find((m) => m.variantId === l.variantId);
          if (existing) existing.qty += l.qty;
          else merged.push({ variantId: l.variantId, qty: l.qty });
        }
        try {
          localStorage.removeItem(storageKey(null));
        } catch {
          /* non-fatal */
        }
        setUid(nextUid);
        setLines(merged);
      } else {
        setUid(null);
        setLines([]);
        setOpen(false);
      }
    };
    void supabase.auth.getSession().then(({ data }) => apply(data.session?.user.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => apply(session?.user.id ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const add = useCallback((variantId: string, qty = 1) => {
    const inc = Math.max(1, Math.floor(qty));
    setLines((prev) => {
      const existing = prev.find((l) => l.variantId === variantId);
      // Changing qty invalidates a prior per-location split (the sum must equal
      // qty), so adding more units drops any existing allocation for this line.
      if (existing) return prev.map((l) => (l.variantId === variantId ? { ...l, qty: l.qty + inc, allocations: undefined } : l));
      return [...prev, { variantId, qty: inc }];
    });
    setOpen(true);
  }, []);

  const setQty = useCallback((variantId: string, qty: number) => {
    const next = Math.floor(qty);
    setLines((prev) =>
      next <= 0
        ? prev.filter((l) => l.variantId !== variantId)
        : prev.map((l) => (l.variantId === variantId ? { ...l, qty: next, allocations: undefined } : l)),
    );
  }, []);

  const setAllocations = useCallback((variantId: string, allocations: RealCartAllocation[] | undefined) => {
    const clean = allocations?.filter((a) => a.qty > 0);
    setLines((prev) => prev.map((l) => (l.variantId === variantId ? { ...l, allocations: clean && clean.length ? clean : undefined } : l)));
  }, []);

  const remove = useCallback((variantId: string) => setLines((prev) => prev.filter((l) => l.variantId !== variantId)), []);
  const clear = useCallback(() => setLines([]), []);

  const value = useMemo<RealCartContextValue>(
    () => ({
      lines,
      add,
      setQty,
      setAllocations,
      remove,
      clear,
      unitCount: lines.reduce((s, l) => s + l.qty, 0),
      open,
      setOpen,
    }),
    [lines, add, setQty, setAllocations, remove, clear, open],
  );

  return <RealCartContext.Provider value={value}>{children}</RealCartContext.Provider>;
}

export function useRealCart(): RealCartContextValue {
  const ctx = useContext(RealCartContext);
  if (!ctx) throw new Error('useRealCart must be used within <RealCartProvider>');
  return ctx;
}
