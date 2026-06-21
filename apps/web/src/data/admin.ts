import { useMemo } from 'react';
import { CATALOG, SUPPLIER_NAMES, unitPriceCents } from '@/data/catalog';
import { resolveTierByUnits, TIERS, type TierDef } from '@/data/tiers';
import { useAccount, type AccountOrder, type OrderStatus } from '@/store';

/**
 * Admin marketplace data. The signed-in operator sees ALL tenants — the live
 * "Downtown Mobile LLC" account (from useAccount, mutated by real checkouts)
 * merged with synthetic tenants. Every monetary figure is derived from the real
 * catalog + tier math (unitPriceCents / TIERS), never hardcoded, so the moment a
 * customer places an order the admin GMV / order count tick up on screen.
 */

const TODAY = '2026-06-20';

export interface AdminOrder {
  id: string;
  customer: string;
  placedAt: string;
  units: number;
  tierLabel: string;
  subtotalCents: number;
  savingsCents: number;
  status: OrderStatus;
  suppliers: string[];
  model: string;
}

export interface AdminCustomer {
  id: string;
  name: string;
  contact: string;
  location: string;
  joinedAt: string;
  tier: TierDef;
  lifetimeUnits: number;
  lifetimeSpentCents: number;
  orders: number;
  lastOrderAt: string | null;
  status: 'active' | 'new' | 'at-risk';
}

export interface AdminKpis {
  gmvCents: number;
  orders: number;
  units: number;
  customers: number;
  aovCents: number;
  savingsCents: number;
  tierMix: { tier: TierDef; orders: number; gmvCents: number }[];
  monthly: { month: string; gmvCents: number }[];
}

interface Profile {
  id: string;
  name: string;
  contact: string;
  location: string;
  joinedAt: string;
}

// Static tenant metadata. Downtown's METRICS come from the live account; only its
// profile fields live here. Synthetic tenants get both profile + synthetic orders.
const PROFILES: Profile[] = [
  { id: 'downtown', name: 'Downtown Mobile LLC', contact: 'Abdu Abdelrahman', location: 'Dallas, TX', joinedAt: '2026-02-04' },
  { id: 'vertex', name: 'Vertex Mobile Group', contact: 'Priya Raghavan', location: 'Phoenix, AZ', joinedAt: '2026-01-12' },
  { id: 'nova', name: 'Nova Telecom Wholesale', contact: 'Marcus Whitfield', location: 'Newark, NJ', joinedAt: '2025-11-22' },
  { id: 'harbor', name: 'Harbor Devices Inc', contact: 'Yuki Tanaka', location: 'Seattle, WA', joinedAt: '2026-03-01' },
  { id: 'bright', name: 'Bright Wireless LLC', contact: 'Dion Alvarez', location: 'Dallas, TX', joinedAt: '2026-05-30' },
  { id: 'coastal', name: 'Coastal Cellular Co', contact: 'Renata Vasquez', location: 'Miami, FL', joinedAt: '2026-04-18' },
  { id: 'pinecrest', name: 'Pinecrest Phone Mart', contact: 'Soren Eklund', location: 'Denver, CO', joinedAt: '2026-06-09' },
];

function mkOrder(id: string, customer: string, placedAt: string, status: OrderStatus, slug: string, qty: number): AdminOrder {
  const item = CATALOG.find((i) => i.id === slug) ?? CATALOG[0];
  const tier = resolveTierByUnits(qty);
  const unit = unitPriceCents(item, tier.code);
  const retail = unitPriceCents(item, 'tier_1');
  const suppliers = item.stock.filter((s) => s.availableQty > 0).map((s) => SUPPLIER_NAMES[s.supplier]);
  return {
    id,
    customer,
    placedAt,
    units: qty,
    tierLabel: tier.label,
    subtotalCents: unit * qty,
    savingsCents: (retail - unit) * qty,
    status,
    suppliers: suppliers.length ? suppliers : [SUPPLIER_NAMES['source-1']],
    model: item.model,
  };
}

// Synthetic cross-tenant order book (real catalog + real tier pricing).
const SYNTHETIC_ORDERS: AdminOrder[] = [
  mkOrder('OMP-9C140', 'Nova Telecom Wholesale', '2026-06-18', 'reserved', 'iphone-16-pro-max', 420),
  mkOrder('OMP-88AE1', 'Vertex Mobile Group', '2026-06-17', 'processing', 'galaxy-s24-ultra', 96),
  mkOrder('OMP-7B2C9', 'Harbor Devices Inc', '2026-06-16', 'shipped', 'iphone-16-pro', 38),
  mkOrder('OMP-5F0A3', 'Bright Wireless LLC', '2026-06-14', 'processing', 'iphone-16', 18),
  mkOrder('OMP-4D771', 'Vertex Mobile Group', '2026-06-09', 'delivered', 'iphone-16-pro-max', 64),
  mkOrder('OMP-3A9E2', 'Coastal Cellular Co', '2026-06-05', 'delivered', 'galaxy-a55', 7),
  mkOrder('OMP-2E5B8', 'Nova Telecom Wholesale', '2026-05-28', 'delivered', 'galaxy-s24', 480),
  mkOrder('OMP-1C6F4', 'Harbor Devices Inc', '2026-05-21', 'delivered', 'iphone-16-plus', 26),
  mkOrder('OMP-0B3D7', 'Pinecrest Phone Mart', '2026-06-11', 'shipped', 'iphone-15-pro', 4),
  mkOrder('OMP-A17E9', 'Vertex Mobile Group', '2026-05-14', 'delivered', 'galaxy-z-fold6', 52),
  mkOrder('OMP-B92C5', 'Bright Wireless LLC', '2026-04-30', 'delivered', 'iphone-16', 14),
  mkOrder('OMP-C45A0', 'Nova Telecom Wholesale', '2026-04-12', 'delivered', 'iphone-16-pro', 410),
  mkOrder('OMP-D6E13', 'Coastal Cellular Co', '2026-03-22', 'delivered', 'iphone-16', 9),
  mkOrder('OMP-E78F6', 'Harbor Devices Inc', '2026-02-19', 'delivered', 'galaxy-s24', 31),
];

function fromAccount(o: AccountOrder): AdminOrder {
  return {
    id: o.id,
    customer: 'Downtown Mobile LLC',
    placedAt: o.placedAt,
    units: o.units,
    tierLabel: o.tierLabel,
    subtotalCents: o.subtotalCents,
    savingsCents: o.savingsCents,
    status: o.status,
    suppliers: o.suppliers,
    model: o.lines[0]?.model ?? '—',
  };
}

const byDateDesc = (a: AdminOrder, b: AdminOrder) => (a.placedAt < b.placedAt ? 1 : a.placedAt > b.placedAt ? -1 : 0);

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86_400_000);
}

function buildCustomers(orders: AdminOrder[]): AdminCustomer[] {
  return PROFILES.map((p) => {
    const own = orders.filter((o) => o.customer === p.name);
    const lifetimeUnits = own.reduce((s, o) => s + o.units, 0);
    const lifetimeSpentCents = own.reduce((s, o) => s + o.subtotalCents, 0);
    const lastOrderAt = own.reduce<string | null>((acc, o) => (acc === null || o.placedAt > acc ? o.placedAt : acc), null);
    const status: AdminCustomer['status'] =
      own.length <= 1 ? 'new' : lastOrderAt && daysBetween(lastOrderAt, TODAY) > 45 ? 'at-risk' : 'active';
    return {
      ...p,
      tier: resolveTierByUnits(lifetimeUnits || 1),
      lifetimeUnits,
      lifetimeSpentCents,
      orders: own.length,
      lastOrderAt,
      status,
    };
  }).sort((a, b) => b.lifetimeSpentCents - a.lifetimeSpentCents);
}

function buildKpis(orders: AdminOrder[], customers: AdminCustomer[]): AdminKpis {
  const gmvCents = orders.reduce((s, o) => s + o.subtotalCents, 0);
  const units = orders.reduce((s, o) => s + o.units, 0);
  const savingsCents = orders.reduce((s, o) => s + o.savingsCents, 0);

  const tierMix = TIERS.map((tier) => {
    const inTier = orders.filter((o) => o.tierLabel === tier.label);
    return { tier, orders: inTier.length, gmvCents: inTier.reduce((s, o) => s + o.subtotalCents, 0) };
  });

  const monthMap = new Map<string, number>();
  for (const o of orders) {
    const m = o.placedAt.slice(0, 7);
    monthMap.set(m, (monthMap.get(m) ?? 0) + o.subtotalCents);
  }
  const monthly = [...monthMap.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, cents]) => ({ month, gmvCents: cents }));

  return {
    gmvCents,
    orders: orders.length,
    units,
    customers: customers.filter((c) => c.orders > 0).length,
    aovCents: orders.length ? Math.round(gmvCents / orders.length) : 0,
    savingsCents,
    tierMix,
    monthly,
  };
}

export function useAdminData(): { orders: AdminOrder[]; customers: AdminCustomer[]; kpis: AdminKpis } {
  const { orders: liveOrders } = useAccount();
  return useMemo(() => {
    const merged = [...liveOrders.map(fromAccount), ...SYNTHETIC_ORDERS].sort(byDateDesc);
    const customers = buildCustomers(merged);
    const kpis = buildKpis(merged, customers);
    return { orders: merged, customers, kpis };
  }, [liveOrders]);
}
