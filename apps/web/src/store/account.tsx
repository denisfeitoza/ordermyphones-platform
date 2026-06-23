import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CATALOG, unitPriceCents } from '@/data/catalog';
import { resolveTierByUnits } from '@/data/tiers';
import type { PricingTierCode } from '@shared/pricing';

export type OrderStatus = 'reserved' | 'processing' | 'shipped' | 'delivered';

export interface OrderLineSnapshot {
  model: string;
  image: string;
  color: string;
  storage: number;
  qty: number;
  unitPriceCents: number;
}

export interface AccountOrder {
  id: string;
  placedAt: string; // ISO date
  units: number;
  tierLabel: string;
  subtotalCents: number;
  savingsCents: number;
  status: OrderStatus;
  suppliers: string[];
  lines: OrderLineSnapshot[];
}

const STORAGE_KEY = 'omp_orders_v1';
const BUSINESS_NAME = 'Downtown Mobile LLC';

function line(id: string, color: string, storage: number, qty: number, tier: PricingTierCode): OrderLineSnapshot {
  const item = CATALOG.find((i) => i.id === id) ?? CATALOG[0];
  return { model: item.model, image: item.image, color, storage, qty, unitPriceCents: unitPriceCents(item, tier) };
}

function seedOrder(
  id: string,
  placedAt: string,
  status: OrderStatus,
  suppliers: string[],
  lines: OrderLineSnapshot[],
): AccountOrder {
  const units = lines.reduce((s, l) => s + l.qty, 0);
  const subtotalCents = lines.reduce((s, l) => s + l.unitPriceCents * l.qty, 0);
  const retail = lines.reduce((s, l) => {
    const item = CATALOG.find((i) => i.model === l.model);
    return s + (item ? unitPriceCents(item, 'tier_1') : l.unitPriceCents) * l.qty;
  }, 0);
  return {
    id,
    placedAt,
    units,
    tierLabel: resolveTierByUnits(units).label,
    subtotalCents,
    savingsCents: retail - subtotalCents,
    status,
    suppliers,
    lines,
  };
}

// Seeded history → ~47 lifetime units, so the account sits at Retailer with 3 to Multi-Store.
// Newest first: placeOrder() prepends live orders, so the whole list stays newest-first.
const SEED: AccountOrder[] = [
  seedOrder('OMP-71F08', '2026-06-15', 'processing', ['Assurant'], [
    line('iphone-16-pro-max', 'Desert Titanium', 256, 5, 'tier_1'),
  ]),
  seedOrder('OMP-6620B', '2026-06-03', 'shipped', ['Assurant', 'Mannapov LLC'], [
    line('iphone-16', 'Ultramarine', 128, 12, 'tier_2'),
  ]),
  seedOrder('OMP-4A19C', '2026-05-12', 'delivered', ['Mannapov LLC'], [
    line('galaxy-s24', 'Cobalt Violet', 128, 30, 'tier_2'),
  ]),
];

function loadOrders(): AccountOrder[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AccountOrder[];
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch {
    // ignore malformed storage
  }
  return SEED;
}

interface AccountContextValue {
  businessName: string;
  orders: AccountOrder[];
  placeOrder: (order: AccountOrder) => void;
  lifetimeUnits: number;
  lifetimeSpentCents: number;
}

const AccountContext = createContext<AccountContextValue | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<AccountOrder[]>(() => loadOrders());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
    } catch {
      // storage may be unavailable (private mode) — non-fatal for the demo
    }
  }, [orders]);

  const placeOrder = useCallback((order: AccountOrder) => {
    setOrders((prev) => [order, ...prev]);
  }, []);

  const value = useMemo<AccountContextValue>(() => {
    const lifetimeUnits = orders.reduce((s, o) => s + o.units, 0);
    const lifetimeSpentCents = orders.reduce((s, o) => s + o.subtotalCents, 0);
    // Newest-first display invariant — independent of insertion/persistence order.
    const sorted = [...orders].sort((a, b) => (a.placedAt < b.placedAt ? 1 : a.placedAt > b.placedAt ? -1 : 0));
    return {
      businessName: BUSINESS_NAME,
      orders: sorted,
      placeOrder,
      lifetimeUnits,
      lifetimeSpentCents,
    };
  }, [orders, placeOrder]);

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountContextValue {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error('useAccount must be used within <AccountProvider>');
  return ctx;
}
