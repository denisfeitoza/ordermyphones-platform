import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/** Auction bid collection (20261019115000_auctions.sql). Bids are binding and sealed. */
export type AuctionSource = 'verizon' | 'bstock' | 'sumitomo' | 'rexi' | 'other';
export const AUCTION_SOURCES: { id: AuctionSource; label: string }[] = [
  { id: 'verizon', label: 'Verizon' },
  { id: 'bstock', label: 'B-Stock' },
  { id: 'sumitomo', label: 'Sumitomo' },
  { id: 'rexi', label: 'Rexi' },
  { id: 'other', label: 'Other' },
];

export interface AuctionEvent {
  id: string;
  source: AuctionSource;
  title: string;
  supplier_deadline: string;
  close_minutes_before: number;
  closes_at: string;
  price_basis: 'unit' | 'lot';
  status: 'draft' | 'open' | 'submitted' | 'cancelled';
  notes: string | null;
  created_at: string;
}

export interface AuctionLot {
  id: string;
  event_id: string;
  lot_ref: string;
  title: string;
  qty: number | null;
  grade: string | null;
  details: Record<string, unknown>;
  sort: number;
}

export const isOpen = (e: Pick<AuctionEvent, 'status' | 'closes_at'>, now = Date.now()) => e.status === 'open' && Date.parse(e.closes_at) > now;

export function useAuctionEvents() {
  return useQuery({
    queryKey: ['auction-events'],
    refetchInterval: 60_000,
    queryFn: async (): Promise<AuctionEvent[]> => {
      const { data, error } = await supabase.from('auction_events').select('*').order('supplier_deadline', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as AuctionEvent[];
    },
  });
}

export function useAuctionLots(eventId: string | undefined) {
  return useQuery({
    queryKey: ['auction-lots', eventId],
    enabled: !!eventId,
    queryFn: async (): Promise<AuctionLot[]> => {
      const out: AuctionLot[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from('auction_lots').select('*').eq('event_id', eventId!).order('sort').order('lot_ref').range(from, from + 999);
        if (error) throw new Error(error.message);
        out.push(...((data ?? []) as AuctionLot[]));
        if (!data || data.length < 1000) break;
      }
      return out;
    },
  });
}

export function useMyStanding(eventId: string | undefined) {
  return useQuery({
    queryKey: ['auction-standing', eventId],
    enabled: !!eventId,
    refetchInterval: 30_000,
    queryFn: async (): Promise<Map<string, { myBidCents: number; leading: boolean }>> => {
      const { data, error } = await supabase.rpc('my_auction_standing', { p_event_id: eventId });
      if (error) throw new Error(error.message);
      return new Map(((data ?? []) as { lot_id: string; my_bid_cents: number; is_leading: boolean }[]).map((r) => [r.lot_id, { myBidCents: Number(r.my_bid_cents), leading: r.is_leading }]));
    },
  });
}

export function usePlaceBid(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ lotId, amountCents }: { lotId: string; amountCents: number }) => {
      const { error } = await supabase.rpc('place_bid', { p_lot_id: lotId, p_amount_cents: amountCents });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['auction-standing', eventId] }),
  });
}

export interface AuctionResult {
  lot_id: string;
  lot_ref: string;
  title: string;
  qty: number | null;
  grade: string | null;
  amount_cents: number | null;
  bid_at: string | null;
  account_id: string | null;
  account_email: string | null;
  account_name: string | null;
  bid_count: number;
}

export function useAuctionResults(eventId: string | undefined) {
  return useQuery({
    queryKey: ['auction-results', eventId],
    enabled: !!eventId,
    refetchInterval: 30_000,
    queryFn: async (): Promise<AuctionResult[]> => {
      const { data, error } = await supabase.rpc('auction_results', { p_event_id: eventId });
      if (error) throw new Error(error.message);
      return ((data ?? []) as AuctionResult[]).map((r) => ({ ...r, amount_cents: r.amount_cents === null ? null : Number(r.amount_cents), bid_count: Number(r.bid_count) }));
    },
  });
}

/** Guess which spreadsheet column is the lot id, the title, the quantity and the grade. */
export function mapLotRows(rows: Record<string, unknown>[]): Omit<AuctionLot, 'id' | 'event_id'>[] {
  if (rows.length === 0) return [];
  const headers = Object.keys(rows[0]!);
  const pick = (re: RegExp) => headers.find((h) => re.test(h.toLowerCase()));
  const refCol = pick(/\b(lot|lot ?#|lot ?id|item ?#|item ?id|id|sku)\b/);
  const titleCol = pick(/desc|title|model|product|name|item/);
  const qtyCol = pick(/\b(qty|quantity|units|count|pcs)\b/);
  const gradeCol = pick(/grade|condition/);
  return rows.map((r, i) => {
    const details: Record<string, unknown> = {};
    for (const h of headers) if (h !== refCol && h !== titleCol && h !== qtyCol && h !== gradeCol && r[h] !== null && r[h] !== '') details[h] = r[h];
    const q = qtyCol ? Number.parseInt(String(r[qtyCol] ?? '').replace(/[^\d]/g, ''), 10) : NaN;
    return {
      lot_ref: String((refCol ? r[refCol] : null) ?? `L${i + 1}`).trim().slice(0, 80) || `L${i + 1}`,
      title: String((titleCol ? r[titleCol] : null) ?? Object.values(details).slice(0, 3).join(' · ') ?? `Lot ${i + 1}`).trim().slice(0, 300) || `Lot ${i + 1}`,
      qty: Number.isFinite(q) ? q : null,
      grade: gradeCol ? String(r[gradeCol] ?? '').trim().slice(0, 60) || null : null,
      details,
      sort: i,
    };
  });
}
