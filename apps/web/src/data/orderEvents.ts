import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/** One field-level change inside an edit. Prices are integer cents; qty is a count. */
export interface OrderChange {
  type: 'qty' | 'price' | 'added' | 'removed' | 'address' | 'note';
  label: string;
  from?: number;
  to?: number;
  qty?: number;
  price?: number;
}

export interface OrderEvent {
  id: string;
  kind: string; // 'edited' in v1
  summary: string | null; // admin's edit reason
  actorRole: string | null;
  changes: OrderChange[];
  createdAt: string;
}

interface RawEvent {
  id: string;
  kind: string;
  summary: string | null;
  actor_role: string | null;
  changes: OrderChange[] | null;
  created_at: string;
}

/** Order edit events. RLS scopes them: admin/staff read all; a customer reads
 * only events for their own orders. Same query works for both surfaces. */
async function fetchOrderEvents(orderId: string): Promise<OrderEvent[]> {
  const { data, error } = await supabase
    .from('order_events')
    .select('id, kind, summary, actor_role, changes, created_at')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as RawEvent[]).map((e) => ({
    id: e.id,
    kind: e.kind,
    summary: e.summary,
    actorRole: e.actor_role,
    changes: Array.isArray(e.changes) ? e.changes : [],
    createdAt: e.created_at,
  }));
}

export function useOrderEvents(orderId: string | undefined) {
  return useQuery({
    queryKey: ['order-events', orderId],
    queryFn: () => fetchOrderEvents(orderId!),
    enabled: !!orderId,
  });
}
