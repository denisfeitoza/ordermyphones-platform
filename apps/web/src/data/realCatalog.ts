import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchAllPages } from '@/lib/supabasePaginate';
import { useAuth } from '@/store/auth';

export type CtiaGrade = 'NEW' | 'CPO' | 'A' | 'B' | 'C' | 'D';

export interface RealLocationStock {
  id: string;
  name: string;
  qty: number;
}

/** One row of public.catalog_listing — the customer-safe read path (see the
 * migration comment in 20260807180000_app_settings.sql). No cost, no
 * carrier_raw, no raw vendor grade, no supplier identity. */
export interface RealListing {
  variantId: string;
  sku: string;
  make: string;
  model: string;
  capacity: string;
  color: string | null;
  carrier: string;
  lockStatus: 'locked' | 'unlocked';
  ctiaGrade: CtiaGrade;
  ctiaLabel: string;
  totalQty: number;
  locations: RealLocationStock[];
}

/** RealListing + the caller's own tier price (null when unavailable — see priceStatus). */
export interface PricedRealListing extends RealListing {
  priceCents: number | null;
}

interface RawCatalogListingRow {
  variant_id: string;
  sku: string;
  make: string;
  model: string;
  capacity: string;
  color: string | null;
  carrier: string;
  lock_status: 'locked' | 'unlocked';
  ctia_grade: CtiaGrade;
  ctia_label: string;
  total_qty: number;
  locations: RealLocationStock[] | null;
}

interface RawPriceRow {
  variant_id: string;
  price_cents: number;
}

const PAGE_SIZE = 500;

async function fetchCatalogListing(): Promise<RealListing[]> {
  const rows = await fetchAllPages<RawCatalogListingRow>(
    (from, to) =>
      supabase
        .from('catalog_listing')
        .select(
          'variant_id, sku, make, model, capacity, color, carrier, lock_status, ctia_grade, ctia_label, total_qty, locations',
        )
        .order('sku')
        .range(from, to),
    PAGE_SIZE,
  );
  return rows.map((r) => ({
    variantId: r.variant_id,
    sku: r.sku,
    make: r.make,
    model: r.model,
    capacity: r.capacity,
    color: r.color,
    carrier: r.carrier,
    lockStatus: r.lock_status,
    ctiaGrade: r.ctia_grade,
    ctiaLabel: r.ctia_label,
    totalQty: r.total_qty,
    locations: r.locations ?? [],
  }));
}

/** The caller's own-tier price, per variant. public.variant_price_for_me
 * grants SELECT to `authenticated` only (20260807150000) — no anon grant —
 * so this must never run for a signed-out visitor; that would surface as a
 * permission-denied error, not an empty result. Callers gate with
 * `enabled: signedIn`. */
async function fetchMyPrices(): Promise<Map<string, number>> {
  const rows = await fetchAllPages<RawPriceRow>(
    (from, to) => supabase.from('variant_price_for_me').select('variant_id, price_cents').range(from, to),
    PAGE_SIZE,
  );
  return new Map(rows.map((r) => [r.variant_id, r.price_cents]));
}

export interface UseRealCatalogResult {
  items: PricedRealListing[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  /** True once pricing has resolved (or will never apply, for a signed-out visitor). */
  pricesReady: boolean;
  signedIn: boolean;
}

/** Real-mode catalog: public.catalog_listing (anon-safe) joined client-side
 * with the caller's own tier price (authenticated-only, server-tier-resolved).
 * `enabled` gates BOTH underlying queries — pass `false` while the storefront
 * is on the mock catalog source so mock mode never pays for the round trip
 * (the "zero visual/behavioral change while mock" contract extends to zero
 * network activity, not just zero rendered difference). */
export function useRealCatalog(enabled = true): UseRealCatalogResult {
  const { signedIn } = useAuth();
  const listingQuery = useQuery({ queryKey: ['catalog-listing'], queryFn: fetchCatalogListing, enabled });
  const priceQuery = useQuery({
    queryKey: ['my-prices'],
    queryFn: fetchMyPrices,
    enabled: enabled && signedIn,
  });

  const prices = priceQuery.data;
  const items: PricedRealListing[] = (listingQuery.data ?? []).map((l) => ({
    ...l,
    priceCents: prices?.get(l.variantId) ?? null,
  }));

  return {
    items,
    isLoading: listingQuery.isLoading,
    isError: listingQuery.isError,
    error: listingQuery.error,
    pricesReady: !signedIn || priceQuery.isSuccess || priceQuery.isError,
    signedIn,
  };
}

const CARRIER_LABEL: Record<string, string> = {
  ATT: 'AT&T',
  VZW: 'Verizon',
  TMO: 'T-Mobile',
  SPR: 'Sprint',
  BST: 'Boost',
  SPC: 'Spectrum',
  XFI: 'Xfinity',
  UNL: 'Unlocked',
  OTH: 'Other',
};

/** Friendly carrier label for a canonical carrier_code — falls back to the
 * raw code for anything not in the known set (never throws on an
 * unrecognized/future code). */
export function carrierLabel(code: string): string {
  return CARRIER_LABEL[code] ?? code;
}

/**
 * Canonical customer-facing display name — model · capacity · lock/carrier.
 * Pure function, no I/O, so it is unit-tested directly (realCatalog.test.ts)
 * against the exact example in the Phase 4 task spec: an unlocked
 * "iPhone 11 Pro" 256GB variant renders "iPhone 11 Pro · 256GB · Unlocked".
 */
export function buildDisplayName(l: Pick<RealListing, 'model' | 'capacity' | 'carrier' | 'lockStatus'>): string {
  const lockPart = l.lockStatus === 'unlocked' ? 'Unlocked' : `${carrierLabel(l.carrier)} Locked`;
  return `${l.model} · ${l.capacity} · ${lockPart}`;
}
