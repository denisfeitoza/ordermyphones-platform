// supabase/functions/fedex-rate/index.ts
// Deno runtime. Shipping ESTIMATE for a destination + unit count.
// Contract: docs/integrations/SHIPMENT-TRACKING.md.
//
// This never touches money: order totals are still tier price × qty computed
// by place_order (D4/D8). The quote is shown at checkout ("estimated
// shipping") and to staff before they ship, nothing more.
//
// Requires the caller's user JWT — quotes cost a FedEx transaction, so they
// are not open to anonymous traffic.

// deno-lint-ignore-file no-explicit-any
// @ts-nocheck — Deno globals are not in this TS server config; resolved at deploy time.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { CORS_HEADERS, FEDEX_ACCOUNT, FedexError, fedexConfigured, fedexPost, json } from '../_shared/fedex.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const MAX_UNITS = 5000;
const PACKAGE_FALLBACK = {
  unit_weight_lb: 0.6,
  box_weight_lb: 0.4,
  units_per_box: 20,
  box_inches: { length: 14, width: 10, height: 8 },
};

interface Parcel {
  count: number;
  weightLb: number;
}

/** Units → parcels of `units_per_box`, plus a lighter remainder parcel. Sent
 * as grouped line items so a 300-unit quote is one small payload. */
function buildParcels(units: number, defaults: typeof PACKAGE_FALLBACK): Parcel[] {
  const perBox = Math.max(1, Math.floor(defaults.units_per_box));
  const full = Math.floor(units / perBox);
  const rest = units % perBox;
  const weight = (u: number) => Math.max(0.1, Math.round((defaults.box_weight_lb + defaults.unit_weight_lb * u) * 10) / 10);
  const parcels: Parcel[] = [];
  if (full > 0) parcels.push({ count: full, weightLb: weight(perBox) });
  if (rest > 0) parcels.push({ count: 1, weightLb: weight(rest) });
  return parcels;
}

function lineItems(parcels: Parcel[], box: typeof PACKAGE_FALLBACK.box_inches) {
  return parcels.map((p) => ({
    groupPackageCount: p.count,
    weight: { units: 'LB', value: p.weightLb },
    dimensions: { length: box.length, width: box.width, height: box.height, units: 'IN' },
  }));
}

function money(detail: any): number | null {
  const shipment = detail?.ratedShipmentDetails?.[0];
  const amount = shipment?.totalNetChargeWithDutiesAndTaxes ?? shipment?.totalNetCharge ?? shipment?.totalNetFedExCharge;
  return typeof amount === 'number' ? Math.round(amount * 100) : null;
}

function transitDays(detail: any): number | null {
  const raw = detail?.commit?.dateDetail?.dayFormat ?? detail?.operationalDetail?.transitTime ?? null;
  const map: Record<string, number> = {
    ONE_DAY: 1, TWO_DAYS: 2, THREE_DAYS: 3, FOUR_DAYS: 4, FIVE_DAYS: 5,
    SIX_DAYS: 6, SEVEN_DAYS: 7, EIGHT_DAYS: 8, NINE_DAYS: 9, TEN_DAYS: 10,
  };
  return typeof raw === 'string' ? map[raw] ?? null : null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!fedexConfigured()) return json({ error: 'fedex_not_configured' }, 503);

  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
  const { data: caller } = await admin.auth.getUser(auth.replace('Bearer ', ''));
  if (!caller?.user) return json({ error: 'unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const dest = body?.destination ?? {};
  const postalCode = String(dest.postal_code ?? '').trim();
  if (!postalCode) return json({ error: 'destination_postal_code_required' }, 400);
  const units = Number(body?.units ?? 1);
  if (!Number.isInteger(units) || units < 1 || units > MAX_UNITS) return json({ error: 'invalid_units' }, 400);

  // ---------- Origins: active warehouses that have an address ----------
  let originQuery = admin
    .from('stock_locations')
    .select('id, code, display_name, city, state_code, postal_code, country_code')
    .eq('active', true)
    .not('postal_code', 'is', null);
  if (typeof body?.location_id === 'string' && body.location_id) originQuery = originQuery.eq('id', body.location_id);
  const { data: origins, error: originError } = await originQuery;
  if (originError) return json({ error: `db_error:${originError.message}` }, 500);
  if (!origins?.length) return json({ error: 'no_origin_configured' }, 409);

  const { data: setting } = await admin
    .from('app_settings')
    .select('value')
    .eq('key', 'shipping_package_defaults')
    .maybeSingle();
  const defaults = { ...PACKAGE_FALLBACK, ...(setting?.value ?? {}) };
  const parcels = buildParcels(units, defaults);
  const packages = lineItems(parcels, defaults.box_inches ?? PACKAGE_FALLBACK.box_inches);

  const options: any[] = [];
  const errors: { origin: string; error: string; detail?: unknown }[] = [];

  for (const origin of origins) {
    try {
      const reply = await fedexPost('/rate/v1/rates/quotes', {
        accountNumber: { value: FEDEX_ACCOUNT },
        rateRequestControlParameters: { returnTransitTimes: true },
        requestedShipment: {
          shipper: {
            address: {
              city: origin.city ?? undefined,
              stateOrProvinceCode: origin.state_code ?? undefined,
              postalCode: origin.postal_code,
              countryCode: origin.country_code ?? 'US',
            },
          },
          recipient: {
            address: {
              city: dest.city || undefined,
              stateOrProvinceCode: dest.state_code || undefined,
              postalCode,
              countryCode: dest.country_code || 'US',
              residential: dest.residential !== false,
            },
          },
          pickupType: 'USE_SCHEDULED_PICKUP',
          rateRequestType: ['ACCOUNT', 'LIST'],
          requestedPackageLineItems: packages,
        },
      });

      for (const detail of reply?.output?.rateReplyDetails ?? []) {
        const amountCents = money(detail);
        if (amountCents === null) continue;
        options.push({
          origin: { id: origin.id, code: origin.code, name: origin.display_name },
          serviceType: detail.serviceType ?? null,
          serviceName: detail.serviceName ?? detail.serviceType ?? null,
          amountCents,
          currency: detail?.ratedShipmentDetails?.[0]?.currency ?? 'USD',
          transitDays: transitDays(detail),
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ origin: origin.code, error: message, detail: err instanceof FedexError ? err.detail : undefined });
    }
  }

  if (options.length === 0) return json({ error: 'no_rates', errors }, 502);

  options.sort((a, b) => a.amountCents - b.amountCents);
  return json({
    options,
    parcels: { count: parcels.reduce((n, p) => n + p.count, 0), weightLb: parcels.reduce((w, p) => w + p.count * p.weightLb, 0) },
    units,
    // Partial failures are reported next to the options they are missing from.
    errors: errors.length ? errors : undefined,
  });
});
