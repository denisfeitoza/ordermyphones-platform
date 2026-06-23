import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { CATALOG, unitPriceCents, type CatalogItem } from '@/data/catalog';
import { tierByCode, type TierDef } from '@/data/tiers';
import { useTier } from './tier';

export interface CartLine {
  key: string;
  itemId: string;
  qty: number;
  color: string;
  storage: number;
}

export interface PricedCartLine extends CartLine {
  item: CatalogItem;
  unitPriceCents: number;
  lineTotalCents: number;
}

interface AddOptions {
  qty?: number;
  color?: string;
  storage?: number;
}

interface CartContextValue {
  lines: PricedCartLine[];
  add: (itemId: string, opts?: AddOptions) => void;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  clear: () => void;
  unitCount: number;
  effectiveTier: TierDef;
  subtotalCents: number;
  retailSubtotalCents: number;
  savingsCents: number;
  open: boolean;
  setOpen: (open: boolean) => void;
}

const CartContext = createContext<CartContextValue | null>(null);

const lineKey = (itemId: string, color: string, storage: number) => `${itemId}:${color}:${storage}`;

export function CartProvider({ children }: { children: ReactNode }) {
  const { code: storedCode } = useTier();
  const [raw, setRaw] = useState<CartLine[]>([]);
  const [open, setOpen] = useState(false);

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
      return [...prev, { key, itemId, qty, color, storage }];
    });
    setOpen(true);
  }, []);

  const setQty = useCallback((key: string, qty: number) => {
    const next = Math.floor(qty);
    setRaw((prev) =>
      next <= 0 ? prev.filter((l) => l.key !== key) : prev.map((l) => (l.key === key ? { ...l, qty: next } : l)),
    );
  }, []);

  const remove = useCallback((key: string) => setRaw((prev) => prev.filter((l) => l.key !== key)), []);
  const clear = useCallback(() => setRaw([]), []);

  const value = useMemo<CartContextValue>(() => {
    const unitCount = raw.reduce((s, l) => s + l.qty, 0);
    // Pricing is the customer's assigned tier only — no cart-quantity upgrade.
    const effectiveTier = tierByCode(storedCode);

    const lines: PricedCartLine[] = raw.flatMap((l) => {
      const item = CATALOG.find((i) => i.id === l.itemId);
      if (!item) return [];
      const unit = unitPriceCents(item, effectiveTier.code);
      return [{ ...l, item, unitPriceCents: unit, lineTotalCents: unit * l.qty }];
    });

    const subtotalCents = lines.reduce((s, l) => s + l.lineTotalCents, 0);
    const retailSubtotalCents = lines.reduce((s, l) => s + unitPriceCents(l.item, 'tier_1') * l.qty, 0);

    return {
      lines,
      add,
      setQty,
      remove,
      clear,
      unitCount,
      effectiveTier,
      subtotalCents,
      retailSubtotalCents,
      savingsCents: retailSubtotalCents - subtotalCents,
      open,
      setOpen,
    };
  }, [raw, storedCode, open, add, setQty, remove, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within <CartProvider>');
  return ctx;
}
