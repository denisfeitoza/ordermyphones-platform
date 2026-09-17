import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * Shipping integration (FedEx, sandbox-first). Two edge functions:
 *
 *  - `fedex-rate`  → an ESTIMATE for an address + unit count. Never part of the
 *    order total; place_order still computes tier price × qty only (D4/D8).
 *  - `fedex-track` → refreshes `shipment_tracking` for one order. The row is
 *    written by the function (service role); we read it under RLS.
 *
 * Both answer 503 `fedex_not_configured` until the FedEx keys are set, and the
 * UI treats that as "feature off", not as an error.
 */

export interface ShippingRateOption {
  origin: { id: string; code: string; name: string };
  serviceType: string | null;
  serviceName: string | null;
  amountCents: number;
  currency: string;
  transitDays: number | null;
}

export interface ShippingQuote {
  options: ShippingRateOption[];
  parcels: { count: number; weightLb: number };
  units: number;
}

export interface ShippingQuoteInput {
  destination: { postal_code: string; state_code?: string | undefined; city?: string | undefined; residential?: boolean | undefined };
  units: number;
  location_id?: string | undefined;
}

/** Thrown with `code` so callers can tell "not wired up yet" from a real failure. */
export class ShippingError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

const NOT_CONFIGURED = 'fedex_not_configured';
export const isShippingDisabled = (err: unknown) => err instanceof ShippingError && err.code === NOT_CONFIGURED;

async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T & { error?: string }>(fn, { body });
  if (error) {
    // FunctionsHttpError carries the response; the body holds our error code.
    const payload = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new ShippingError(payload?.error ?? 'request_failed', payload?.error ?? error.message);
  }
  if (data && typeof data === 'object' && 'error' in data && data.error) throw new ShippingError(String(data.error));
  return data as T;
}

/** On-demand quote (a button, never a keystroke — each call costs a FedEx transaction). */
export function useShippingQuote() {
  return useMutation<ShippingQuote, Error, ShippingQuoteInput>({
    mutationFn: (input) => invoke<ShippingQuote>('fedex-rate', { ...input }),
  });
}

export type TrackingStatus =
  | 'queued'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'exception'
  | 'returned'
  | 'unknown';

export interface TrackingEvent {
  at: string | null;
  status: TrackingStatus;
  description: string | null;
  location: string | null;
}

export interface OrderTracking {
  orderId: string;
  carrier: string;
  trackingNumber: string;
  status: TrackingStatus;
  statusDetail: string | null;
  estimatedAt: string | null;
  deliveredAt: string | null;
  lastEventAt: string | null;
  events: TrackingEvent[];
  polledAt: string | null;
  pollError: string | null;
}

interface RawTracking {
  order_id: string;
  carrier: string;
  tracking_number: string;
  status: TrackingStatus;
  status_detail: string | null;
  estimated_at: string | null;
  delivered_at: string | null;
  last_event_at: string | null;
  events: TrackingEvent[] | null;
  polled_at: string | null;
  poll_error: string | null;
}

const mapTracking = (r: RawTracking): OrderTracking => ({
  orderId: r.order_id,
  carrier: r.carrier,
  trackingNumber: r.tracking_number,
  status: r.status,
  statusDetail: r.status_detail,
  estimatedAt: r.estimated_at,
  deliveredAt: r.delivered_at,
  lastEventAt: r.last_event_at,
  events: r.events ?? [],
  polledAt: r.polled_at,
  pollError: r.poll_error,
});

export const trackingKey = (orderId: string) => ['shipment-tracking', orderId];

/** Stored tracking state for one order; null when nothing has been polled yet. */
export function useOrderTracking(orderId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: trackingKey(orderId ?? 'none'),
    enabled: Boolean(orderId) && enabled,
    queryFn: async (): Promise<OrderTracking | null> => {
      const { data, error } = await supabase
        .from('shipment_tracking')
        .select('order_id, carrier, tracking_number, status, status_detail, estimated_at, delivered_at, last_event_at, events, polled_at, poll_error')
        .eq('order_id', orderId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? mapTracking(data as RawTracking) : null;
    },
  });
}

export function useRefreshTracking(orderId: string) {
  const qc = useQueryClient();
  return useMutation<OrderTracking, Error, void>({
    mutationFn: async () => {
      const res = await invoke<{ tracking: RawTracking }>('fedex-track', { order_id: orderId });
      return mapTracking(res.tracking);
    },
    onSuccess: (tracking) => {
      qc.setQueryData(trackingKey(orderId), tracking);
    },
  });
}
