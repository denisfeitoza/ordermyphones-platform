import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchAllPagesParallel } from '@/lib/supabasePaginate';
import { useAuth } from '@/store/auth';
import { useTier } from '@/store/tier';

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
  createdAt: string;
  soldQty: number;
  /** The model's image (products.image_url, from the image bank); null = placeholder. */
  imageUrl: string | null;
  /** imageUrl shows another model of the family; the store labels it illustrative. */
  imageApprox: boolean;
  description: string | null;
  /** products.category — 'phones' | 'accessories' | 'wearables'. */
  category: string;
  /** Staff photo for this variant's colour (product_color_images); wins over imageUrl. */
  colorImageUrl: string | null;
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
  created_at: string;
  sold_qty: number | null;
  image_url: string | null;
  description: string | null;
  category: string | null;
  color_image_url: string | null;
  image_approx: boolean | null;
}

interface RawPriceRow {
  variant_id: string;
  price_cents: number;
}

const PAGE_SIZE = 500;

export async function fetchCatalogListing(): Promise<RealListing[]> {
  const rows = await fetchAllPagesParallel<RawCatalogListingRow>(
    (from, to) =>
      supabase
        .from('catalog_listing')
        .select(
          'variant_id, sku, make, model, capacity, color, carrier, lock_status, ctia_grade, ctia_label, total_qty, locations, created_at, sold_qty, image_url, description, category, color_image_url, image_approx',
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
    // Vendor sheets use "*" / "-" for "no colour" — never show that to a buyer.
    color: r.color && /[a-z]/i.test(r.color) ? r.color : null,
    carrier: r.carrier,
    lockStatus: r.lock_status,
    ctiaGrade: r.ctia_grade,
    ctiaLabel: r.ctia_label,
    totalQty: r.total_qty,
    locations: r.locations ?? [],
    createdAt: r.created_at,
    soldQty: r.sold_qty ?? 0,
    imageUrl: r.image_url ?? null,
    imageApprox: r.image_approx === true,
    description: r.description ?? null,
    category: r.category ?? 'phones',
    colorImageUrl: r.color_image_url ?? null,
  }));
}

/** The caller's own-tier price, per variant. public.variant_price_for_me
 * grants SELECT to `authenticated` only (20260807150000) — no anon grant —
 * so this must never run for a signed-out visitor; that would surface as a
 * permission-denied error, not an empty result. Callers gate with
 * `enabled: signedIn`. */
async function fetchMyPrices(): Promise<Map<string, number>> {
  const rows = await fetchAllPagesParallel<RawPriceRow>(
    (from, to) => supabase.from('variant_price_for_me').select('variant_id, price_cents').order('variant_id').range(from, to),
    PAGE_SIZE,
  );
  return new Map(rows.map((r) => [r.variant_id, r.price_cents]));
}

/** Admin "view store as <tier>": prices for an ARBITRARY tier, read from the
 * staff-readable prices table (admins have no own tier, so variant_price_for_me
 * returns nothing for them). Gated to staff by RLS. `tier` is the DB tier name. */
async function fetchTierPrices(tier: string): Promise<Map<string, number>> {
  const rows = await fetchAllPagesParallel<RawPriceRow>(
    (from, to) => supabase.from('prices').select('variant_id, price_cents').eq('tier', tier).eq('visible', true).order('variant_id').range(from, to),
    PAGE_SIZE,
  );
  return new Map(rows.map((r) => [r.variant_id, r.price_cents]));
}

/** PricingTierCode (tier_1..4) -> DB customer_tier name. */
const CODE_TO_DB_TIER: Record<string, string> = { tier_1: 'consumer', tier_2: 'retailer', tier_3: 'wholesale', tier_4: 'distributor' };

export interface UseRealCatalogResult {
  items: PricedRealListing[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  /** True once pricing has resolved (or will never apply, for a signed-out visitor). */
  pricesReady: boolean;
  /** The tier-price request failed: every price would read "not priced" — show an error instead. */
  pricesError: boolean;
  retryPrices: () => void;
  signedIn: boolean;
}

/** Real-mode catalog: public.catalog_listing (anon-safe) joined client-side
 * with the caller's own tier price (authenticated-only, server-tier-resolved).
 * `enabled` gates BOTH underlying queries — pass `false` while the storefront
 * is on the mock catalog source so mock mode never pays for the round trip
 * (the "zero visual/behavioral change while mock" contract extends to zero
 * network activity, not just zero rendered difference). */
/**
 * The caller's tier-price query (own tier, or the previewed tier for admin
 * "view store as…"). Shared by useRealCatalog and RealPriceTag: same key, so
 * TanStack Query dedupes it — one request, one cache entry.
 */
export function useTierPriceQuery(enabled = true) {
  const { signedIn, role } = useAuth();
  const { previewCode } = useTier();
  // Admin/staff previewing a tier ("view store as…") price the catalog for that
  // tier; everyone else sees their own server-resolved tier price.
  const previewTier = (role === 'admin' || role === 'staff') && previewCode ? (CODE_TO_DB_TIER[previewCode] ?? null) : null;
  const query = useQuery({
    queryKey: previewTier ? ['tier-prices', previewTier] : ['my-prices'],
    queryFn: previewTier ? () => fetchTierPrices(previewTier) : fetchMyPrices,
    enabled: enabled && (previewTier ? true : signedIn),
    staleTime: 3 * 60_000,
    gcTime: 15 * 60_000,
  });
  return { query, previewTier, signedIn };
}

export function useRealCatalog(enabled = true): UseRealCatalogResult {
  // The listing is ~1.4 MB across 6 pages; keep it for a few minutes so moving
  // between catalog, model pages and checkout does not download it again.
  // Imports and repricing invalidate it explicitly.
  const listingQuery = useQuery({ queryKey: ['catalog-listing'], queryFn: fetchCatalogListing, enabled, staleTime: 3 * 60_000, gcTime: 15 * 60_000 });
  const { query: priceQuery, previewTier, signedIn } = useTierPriceQuery(enabled);

  const prices = priceQuery.data;
  // Stable across renders: everything downstream (facets, grouping, the search
  // text cache) memoizes on this array's identity.
  const listing = listingQuery.data;
  const items: PricedRealListing[] = useMemo(
    () => (listing ?? []).map((l) => ({ ...l, priceCents: prices?.get(l.variantId) ?? null })),
    [listing, prices],
  );

  return {
    items,
    isLoading: listingQuery.isLoading,
    isError: listingQuery.isError,
    error: listingQuery.error,
    pricesReady: (!signedIn && !previewTier) || priceQuery.isSuccess || priceQuery.isError,
    pricesError: priceQuery.isError,
    retryPrices: () => void priceQuery.refetch(),
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
  // "Other Locked" (carrier OTH) says nothing to a buyer — just "Locked".
  const lockPart = l.lockStatus === 'unlocked' ? 'Unlocked' : l.carrier === 'OTH' ? 'Locked' : `${carrierLabel(l.carrier)} Locked`;
  // Accessories come through the phone import with a placeholder "1GB"
  // capacity (AirPods, Watch…); no phone ships with 1GB, so hide it.
  const cap = l.capacity && !/^1\s*GB$/i.test(l.capacity.trim()) ? l.capacity : null;
  return [l.model, cap, lockPart].filter(Boolean).join(' · ');
}
