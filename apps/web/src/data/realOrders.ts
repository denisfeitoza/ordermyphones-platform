import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { carrierLabel } from './realCatalog';

export type RealOrderStatus = 'pending' | 'approved' | 'partially_approved' | 'rejected' | 'cancelled';

export interface RealOrderLine {
  id: string;
  variantId: string;
  sku: string;
  make: string;
  model: string;
  capacity: string;
  color: string | null;
  carrier: string;
  lockStatus: 'locked' | 'unlocked';
  qtyRequested: number;
  qtyApproved: number | null;
  unitPriceCents: number;
  lineTotalCents: number;
}

export interface RealOrder {
  id: string;
  status: RealOrderStatus;
  tier: string;
  subtotalCents: number;
  placedAt: string;
  decidedAt: string | null;
  decisionReason: string | null;
  notes: string | null;
  shippingAddress: { street?: string; city?: string; state?: string; zip?: string } | null;
  isTest: boolean;
  lines: RealOrderLine[];
}

interface RawOrderRow {
  id: string;
  status: RealOrderStatus;
  tier_at_order: string;
  subtotal_cents: number;
  placed_at: string;
  decided_at: string | null;
  decision_reason: string | null;
  notes: string | null;
  shipping_address: RealOrder['shippingAddress'];
  is_test: boolean;
}

interface RawItemRow {
  id: string;
  order_id: string;
  variant_id: string;
  sku: string;
  make: string;
  model: string;
  capacity: string;
  color: string | null;
  carrier_code: string;
  lock_status: 'locked' | 'unlocked';
  qty_requested: number;
  qty_approved: number | null;
  unit_price_cents: number;
}

function mapLine(r: RawItemRow): RealOrderLine {
  return {
    id: r.id,
    variantId: r.variant_id,
    sku: r.sku,
    make: r.make,
    model: r.model,
    capacity: r.capacity,
    color: r.color,
    carrier: carrierLabel(r.carrier_code),
    lockStatus: r.lock_status,
    qtyRequested: r.qty_requested,
    qtyApproved: r.qty_approved,
    unitPriceCents: r.unit_price_cents,
    lineTotalCents: r.unit_price_cents * r.qty_requested,
  };
}

/** The signed-in customer's real orders (RLS scopes orders to the owner; the
 * my_order_items view scopes lines the same way). Lines are fetched via the
 * customer-safe display view — no cost/grade/supplier ever reaches the client. */
async function fetchMyOrders(): Promise<RealOrder[]> {
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, status, tier_at_order, subtotal_cents, placed_at, decided_at, decision_reason, notes, shipping_address, is_test')
    .order('placed_at', { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (orders ?? []) as RawOrderRow[];
  if (rows.length === 0) return [];

  const { data: items, error: itemErr } = await supabase
    .from('my_order_items')
    .select('id, order_id, variant_id, sku, make, model, capacity, color, carrier_code, lock_status, qty_requested, qty_approved, unit_price_cents')
    .in('order_id', rows.map((o) => o.id));
  if (itemErr) throw new Error(itemErr.message);

  const byOrder = new Map<string, RealOrderLine[]>();
  for (const it of (items ?? []) as RawItemRow[]) {
    const list = byOrder.get(it.order_id) ?? [];
    list.push(mapLine(it));
    byOrder.set(it.order_id, list);
  }

  return rows.map((o) => ({
    id: o.id,
    status: o.status,
    tier: o.tier_at_order,
    subtotalCents: o.subtotal_cents,
    placedAt: o.placed_at,
    decidedAt: o.decided_at,
    decisionReason: o.decision_reason,
    notes: o.notes,
    shippingAddress: o.shipping_address,
    isTest: o.is_test ?? false,
    lines: byOrder.get(o.id) ?? [],
  }));
}

export function useMyOrders() {
  const { signedIn } = useAuth();
  return useQuery({ queryKey: ['my-orders'], queryFn: fetchMyOrders, enabled: signedIn });
}
