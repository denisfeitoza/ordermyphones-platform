// supabase/functions/fedex-track/index.ts
// Deno runtime. Refreshes carrier tracking for shipped orders.
// Contract: docs/integrations/SHIPMENT-TRACKING.md §2-§3.
//
// Two ways in:
//   { order_id }  with the caller's user JWT — a customer refreshing their own
//                 order, or staff refreshing any order. Authorization is the
//                 order's own RLS policy: the read runs as the caller.
//   { sweep: true } with Bearer FEDEX_TRACK_SWEEP_SECRET — the scheduled poll
//                 (pg_cron / scheduler), no JWT.
//
// Writes go through the service role, because shipment_tracking has no write
// policy by design: only this function may author tracking state.

// deno-lint-ignore-file no-explicit-any
// @ts-nocheck — Deno globals are not in this TS server config; resolved at deploy time.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { CORS_HEADERS, FedexError, fedexConfigured, fedexPost, json, mapTrackingStatus } from '../_shared/fedex.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SWEEP_SECRET = Deno.env.get('FEDEX_TRACK_SWEEP_SECRET') ?? '';

/** Statuses worth re-polling, and how stale a row must be before we do. */
const OPEN_STATUSES = ['queued', 'in_transit', 'out_for_delivery', 'exception', 'unknown'];
const STALE_MINUTES = 30;
const SWEEP_LIMIT = 50;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

interface OrderRow {
  id: string;
  tracking_carrier: string | null;
  tracking_number: string | null;
}

const isFedex = (carrier: string | null | undefined) => /fedex/i.test(carrier ?? '');

/** FedEx scan events → newest-first [{at, status, description, location}]. */
function normalizeEvents(events: any[]): unknown[] {
  return (events ?? [])
    .map((e) => ({
      at: e?.date ?? null,
      status: mapTrackingStatus(e?.derivedStatusCode ?? e?.eventType),
      description: e?.eventDescription ?? e?.derivedStatus ?? null,
      location: [e?.scanLocation?.city, e?.scanLocation?.stateOrProvinceCode, e?.scanLocation?.countryCode]
        .filter(Boolean)
        .join(', ') || null,
    }))
    .sort((a, b) => Date.parse(b.at ?? 0) - Date.parse(a.at ?? 0));
}

async function poll(order: OrderRow) {
  const trackingNumber = order.tracking_number!.trim();
  const body = await fedexPost('/track/v1/trackingnumbers', {
    includeDetailedScans: true,
    trackingInfo: [{ trackingNumberInfo: { trackingNumber } }],
  });

  const result = body?.output?.completeTrackResults?.[0]?.trackResults?.[0];
  const error = result?.error;
  if (error) throw new FedexError(`fedex:${error.code ?? 'track_error'}`, error);

  const latest = result?.latestStatusDetail;
  const events = normalizeEvents(result?.scanEvents);
  const status = mapTrackingStatus(latest?.derivedCode);
  const estimated =
    result?.dateAndTimes?.find((d: any) => d?.type === 'ESTIMATED_DELIVERY')?.dateTime ??
    result?.standardTransitTimeWindow?.window?.ends ??
    null;
  const delivered =
    status === 'delivered'
      ? result?.dateAndTimes?.find((d: any) => d?.type === 'ACTUAL_DELIVERY')?.dateTime ?? events[0]?.at ?? null
      : null;

  const row = {
    order_id: order.id,
    carrier: 'FedEx',
    tracking_number: trackingNumber,
    status,
    status_detail: latest?.description ?? latest?.statusByLocale ?? null,
    estimated_at: estimated,
    delivered_at: delivered,
    last_event_at: events[0]?.at ?? null,
    events,
    polled_at: new Date().toISOString(),
    poll_error: null,
  };
  const { error: upsertError } = await admin.from('shipment_tracking').upsert(row, { onConflict: 'order_id' });
  if (upsertError) throw new Error(`db_error:${upsertError.message}`);
  return row;
}

/** A failed poll is recorded on the row (so the UI can say "last checked"),
 * never swallowed silently. */
async function recordFailure(order: OrderRow, message: string) {
  await admin.from('shipment_tracking').upsert(
    {
      order_id: order.id,
      carrier: 'FedEx',
      tracking_number: (order.tracking_number ?? '').trim(),
      polled_at: new Date().toISOString(),
      poll_error: message.slice(0, 300),
    },
    { onConflict: 'order_id' },
  );
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!fedexConfigured()) return json({ error: 'fedex_not_configured' }, 503);

  const body = await req.json().catch(() => ({}));
  const auth = req.headers.get('authorization') ?? '';
  const sweepMode = body?.sweep === true;

  // ---------- Scheduled sweep: shared secret, no JWT ----------
  if (sweepMode) {
    if (!SWEEP_SECRET || auth !== `Bearer ${SWEEP_SECRET}`) return json({ error: 'forbidden' }, 403);

    const staleBefore = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString();
    const { data: orders, error } = await admin
      .from('orders')
      .select('id, tracking_carrier, tracking_number, shipment_tracking(status, polled_at)')
      .eq('status', 'shipped')
      .not('tracking_number', 'is', null)
      .limit(SWEEP_LIMIT * 4);
    if (error) return json({ error: `db_error:${error.message}` }, 500);

    const due = (orders ?? [])
      .filter((o: any) => isFedex(o.tracking_carrier) && (o.tracking_number ?? '').trim())
      .filter((o: any) => {
        const t = Array.isArray(o.shipment_tracking) ? o.shipment_tracking[0] : o.shipment_tracking;
        if (!t) return true;
        if (!OPEN_STATUSES.includes(t.status)) return false;
        return !t.polled_at || t.polled_at < staleBefore;
      })
      .slice(0, SWEEP_LIMIT);

    let ok = 0;
    const failures: { order_id: string; error: string }[] = [];
    for (const order of due) {
      try {
        await poll(order as OrderRow);
        ok++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await recordFailure(order as OrderRow, message);
        failures.push({ order_id: order.id, error: message });
      }
    }
    return json({ swept: due.length, ok, failures });
  }

  // ---------- Single order: the caller's own JWT decides visibility ----------
  const orderId = body?.order_id;
  if (typeof orderId !== 'string' || !orderId) return json({ error: 'order_id_required' }, 400);
  if (!auth.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);

  const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: auth } },
  });
  const { data: order, error: readError } = await asCaller
    .from('orders')
    .select('id, tracking_carrier, tracking_number')
    .eq('id', orderId)
    .maybeSingle();
  if (readError) return json({ error: `db_error:${readError.message}` }, 500);
  // RLS-filtered: not visible to this caller is indistinguishable from absent.
  if (!order) return json({ error: 'order_not_found' }, 404);
  if (!order.tracking_number) return json({ error: 'no_tracking_number' }, 409);
  if (!isFedex(order.tracking_carrier)) {
    return json({ error: 'carrier_not_supported', carrier: order.tracking_carrier }, 409);
  }

  try {
    const row = await poll(order as OrderRow);
    return json({ tracking: row });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordFailure(order as OrderRow, message);
    const detail = err instanceof FedexError ? err.detail : undefined;
    return json({ error: message, detail }, 502);
  }
});
