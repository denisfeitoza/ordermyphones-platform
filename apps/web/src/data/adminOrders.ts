import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { carrierLabel } from './realCatalog';

export type AdminOrderStatus = 'pending' | 'approved' | 'partially_approved' | 'rejected' | 'cancelled';

export interface AdminOrderLine {
  id: string;
  variantId: string;
  name: string;
  sku: string;
  qtyRequested: number;
  qtyApproved: number | null;
  unitPriceCents: number;
  lineTotalCents: number;
}

export interface ShippingAddress {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
}

export interface AdminOrder {
  id: string;
  status: AdminOrderStatus;
  tier: string;
  subtotalCents: number;
  placedAt: string;
  decidedAt: string | null;
  decisionReason: string | null;
  note: string | null;
  shippingAddress: ShippingAddress | null;
  customerEmail: string | null;
  customerName: string | null;
  lines: AdminOrderLine[];
}

interface RawVariant {
  sku: string;
  capacity: string;
  color: string | null;
  carrier: string;
  lock_status: 'locked' | 'unlocked';
  products: { make: string; model: string } | null;
}
interface RawItem {
  id: string;
  variant_id: string;
  qty_requested: number;
  qty_approved: number | null;
  unit_price_cents: number;
  product_variants: RawVariant | null;
}
interface RawOrder {
  id: string;
  status: AdminOrderStatus;
  tier_at_order: string;
  subtotal_cents: number;
  placed_at: string;
  decided_at: string | null;
  decision_reason: string | null;
  notes: string | null;
  shipping_address: ShippingAddress | null;
  customer: { email: string | null; display_name: string | null } | null;
  order_items: RawItem[];
}

function variantName(v: RawVariant | null): string {
  if (!v) return 'Unknown variant';
  const lock = v.lock_status === 'unlocked' ? 'Unlocked' : `${carrierLabel(v.carrier)} Locked`;
  return `${v.products?.model ?? v.sku} · ${v.capacity} · ${lock}`;
}

async function fetchAdminOrders(): Promise<AdminOrder[]> {
  const { data, error } = await supabase
    .from('orders')
    .select(
      `id, status, tier_at_order, subtotal_cents, placed_at, decided_at, decision_reason, notes, shipping_address,
       customer:profiles!orders_customer_id_fkey(email, display_name),
       order_items(id, variant_id, qty_requested, qty_approved, unit_price_cents,
         product_variants(sku, capacity, color, carrier, lock_status, products(make, model)))`,
    )
    .order('placed_at', { ascending: false });
  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as RawOrder[]).map((o) => ({
    id: o.id,
    status: o.status,
    tier: o.tier_at_order,
    subtotalCents: o.subtotal_cents,
    placedAt: o.placed_at,
    decidedAt: o.decided_at,
    decisionReason: o.decision_reason,
    note: o.notes,
    shippingAddress: o.shipping_address,
    customerEmail: o.customer?.email ?? null,
    customerName: o.customer?.display_name ?? null,
    lines: (o.order_items ?? []).map((it) => ({
      id: it.id,
      variantId: it.variant_id,
      name: variantName(it.product_variants),
      sku: it.product_variants?.sku ?? '',
      qtyRequested: it.qty_requested,
      qtyApproved: it.qty_approved,
      unitPriceCents: it.unit_price_cents,
      lineTotalCents: it.unit_price_cents * it.qty_requested,
    })),
  }));
}

export function useAdminOrders() {
  return useQuery({ queryKey: ['admin-orders'], queryFn: fetchAdminOrders });
}

/** Live total balance per variant, summed across locations from the inventory
 * cache (staff-readable). Used to show "available NOW" on the approval screen. */
async function fetchAvailability(variantIds: string[]): Promise<Map<string, number>> {
  if (variantIds.length === 0) return new Map();
  const { data, error } = await supabase.from('inventory').select('variant_id, qty').in('variant_id', variantIds);
  if (error) throw new Error(error.message);
  const m = new Map<string, number>();
  for (const row of (data ?? []) as { variant_id: string; qty: number }[]) {
    m.set(row.variant_id, (m.get(row.variant_id) ?? 0) + row.qty);
  }
  return m;
}

export function useVariantAvailability(variantIds: string[]) {
  const key = [...variantIds].sort().join(',');
  return useQuery({
    queryKey: ['variant-availability', key],
    queryFn: () => fetchAvailability(variantIds),
    enabled: variantIds.length > 0,
  });
}

export interface ReconciliationRow {
  id: string;
  orderItemId: string;
  variantId: string;
  name: string;
  sku: string;
  shortfallQty: number;
  createdAt: string;
}

interface RawRecon {
  id: string;
  order_item_id: string;
  variant_id: string;
  shortfall_qty: number;
  created_at: string;
  product_variants: RawVariant | null;
}

async function fetchOpenReconciliations(): Promise<ReconciliationRow[]> {
  const { data, error } = await supabase
    .from('reconciliation_queue')
    .select(
      `id, order_item_id, variant_id, shortfall_qty, created_at,
       product_variants(sku, capacity, color, carrier, lock_status, products(make, model))`,
    )
    .eq('status', 'open')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as RawRecon[]).map((r) => ({
    id: r.id,
    orderItemId: r.order_item_id,
    variantId: r.variant_id,
    name: variantName(r.product_variants),
    sku: r.product_variants?.sku ?? '',
    shortfallQty: r.shortfall_qty,
    createdAt: r.created_at,
  }));
}

export function useOpenReconciliations() {
  return useQuery({ queryKey: ['open-reconciliations'], queryFn: fetchOpenReconciliations });
}

/** Invalidates every order/inventory/reconciliation query after a decision so
 * the UI reflects deducted balances and new statuses immediately. */
function useInvalidateOrderData() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['admin-orders'] });
    qc.invalidateQueries({ queryKey: ['variant-availability'] });
    qc.invalidateQueries({ queryKey: ['open-reconciliations'] });
    qc.invalidateQueries({ queryKey: ['my-orders'] });
  };
}

export function useApproveOrder() {
  const invalidate = useInvalidateOrderData();
  return useMutation({
    mutationFn: async (orderId: string) => {
      const { data, error } = await supabase.rpc('approve_order', { p_order_id: orderId });
      if (error) throw new Error(error.message);
      return data as { status: string; approved_lines: number; short_lines: number; reconciliation_ids: string[] };
    },
    onSuccess: invalidate,
  });
}

export interface EditOrderItem {
  variant_id: string;
  qty: number;
  unit_price_cents: number;
}

/** Full edit of a pending order (items, prices, address, note). The RPC records
 * a customer-visible diff into order_events; we invalidate both order surfaces. */
export function useEditOrder() {
  const qc = useQueryClient();
  const invalidate = useInvalidateOrderData();
  return useMutation({
    mutationFn: async (input: {
      orderId: string;
      items: EditOrderItem[];
      shippingAddress?: ShippingAddress | null;
      note?: string | null;
      reason?: string | null;
    }) => {
      const { data, error } = await supabase.rpc('admin_edit_order', {
        p_order_id: input.orderId,
        p_items: input.items,
        p_shipping_address: input.shippingAddress ?? null,
        p_note: input.note ?? null,
        p_reason: input.reason ?? null,
      });
      if (error) throw new Error(error.message);
      return data as { order_id: string; subtotal_cents: number; changes: unknown[] };
    },
    onSuccess: (_data, vars) => {
      invalidate();
      qc.invalidateQueries({ queryKey: ['order-events', vars.orderId] });
    },
  });
}

export function useRejectOrder() {
  const invalidate = useInvalidateOrderData();
  return useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: string; reason: string }) => {
      const { error } = await supabase.rpc('reject_order', { p_order_id: orderId, p_reason: reason });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

export function useResolveReconciliation() {
  const invalidate = useInvalidateOrderData();
  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'fulfill' | 'cancel' }) => {
      const { data, error } = await supabase.rpc('resolve_reconciliation', { p_id: id, p_action: action });
      if (error) throw new Error(error.message);
      return data as { deducted: number; remaining_shortfall: number };
    },
    onSuccess: invalidate,
  });
}
