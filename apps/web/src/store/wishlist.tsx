import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CATALOG, unitPriceCents, type CatalogItem } from '@/data/catalog';
import { useTier } from './tier';

export interface WishlistItem {
  key: string;
  itemId: string;
  color: string;
  storage: number;
  qty: number;
}

export interface PricedWishlistLine extends WishlistItem {
  item: CatalogItem;
  unitPriceCents: number;
  lineTotalCents: number;
}

interface AddOptions {
  qty?: number;
  color?: string;
  storage?: number;
}

interface WishlistContextValue {
  lines: PricedWishlistLine[];
  count: number;
  unitCount: number;
  subtotalCents: number;
  retailSubtotalCents: number;
  savingsCents: number;
  has: (itemId: string) => boolean;
  toggleItem: (itemId: string, opts?: AddOptions) => void;
  add: (itemId: string, opts?: AddOptions) => void;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  clear: () => void;
}

const WishlistContext = createContext<WishlistContextValue | null>(null);

const STORAGE_KEY = 'omp_wishlist_v1';
const lineKey = (itemId: string, color: string, storage: number) => `${itemId}:${color}:${storage}`;

function loadItems(): WishlistItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as WishlistItem[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore
  }
  return [];
}

export function WishlistProvider({ children }: { children: ReactNode }) {
  const { code } = useTier();
  const [raw, setRaw] = useState<WishlistItem[]>(() => loadItems());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(raw));
    } catch {
      // storage unavailable — non-fatal
    }
  }, [raw]);

  const add = useCallback((itemId: string, opts?: AddOptions) => {
    const item = CATALOG.find((i) => i.id === itemId);
    if (!item) return;
    const color = opts?.color ?? item.colors[0].name;
    const storage = opts?.storage ?? item.storage[0];
    const qty = Math.max(1, Math.floor(opts?.qty ?? 1));
    const key = lineKey(itemId, color, storage);
    setRaw((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) return prev.map((l) => (l.key === key ? { ...l, qty: l.qty + qty } : l));
      return [...prev, { key, itemId, color, storage, qty }];
    });
  }, []);

  const setQty = useCallback((key: string, qty: number) => {
    const next = Math.floor(qty);
    setRaw((prev) => (next <= 0 ? prev.filter((l) => l.key !== key) : prev.map((l) => (l.key === key ? { ...l, qty: next } : l))));
  }, []);

  const remove = useCallback((key: string) => setRaw((prev) => prev.filter((l) => l.key !== key)), []);
  const clear = useCallback(() => setRaw([]), []);

  const has = useCallback((itemId: string) => raw.some((l) => l.itemId === itemId), [raw]);

  const toggleItem = useCallback(
    (itemId: string, opts?: AddOptions) => {
      setRaw((prev) => {
        if (prev.some((l) => l.itemId === itemId)) return prev.filter((l) => l.itemId !== itemId);
        const item = CATALOG.find((i) => i.id === itemId);
        if (!item) return prev;
        const color = opts?.color ?? item.colors[0].name;
        const storage = opts?.storage ?? item.storage[0];
        const qty = Math.max(1, Math.floor(opts?.qty ?? 1));
        return [...prev, { key: lineKey(itemId, color, storage), itemId, color, storage, qty }];
      });
    },
    [],
  );

  const value = useMemo<WishlistContextValue>(() => {
    const lines: PricedWishlistLine[] = raw.flatMap((l) => {
      const item = CATALOG.find((i) => i.id === l.itemId);
      if (!item) return [];
      const unit = unitPriceCents(item, code);
      return [{ ...l, item, unitPriceCents: unit, lineTotalCents: unit * l.qty }];
    });
    const subtotalCents = lines.reduce((s, l) => s + l.lineTotalCents, 0);
    const retailSubtotalCents = lines.reduce((s, l) => s + unitPriceCents(l.item, 'tier_1') * l.qty, 0);
    return {
      lines,
      count: lines.length,
      unitCount: lines.reduce((s, l) => s + l.qty, 0),
      subtotalCents,
      retailSubtotalCents,
      savingsCents: retailSubtotalCents - subtotalCents,
      has,
      toggleItem,
      add,
      setQty,
      remove,
      clear,
    };
  }, [raw, code, has, toggleItem, add, setQty, remove, clear]);

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist(): WishlistContextValue {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error('useWishlist must be used within <WishlistProvider>');
  return ctx;
}
