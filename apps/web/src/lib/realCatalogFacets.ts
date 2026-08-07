/**
 * Faceted filtering for the REAL-mode catalog (M2-P1). Pure, no I/O, so the
 * facet math is unit-tested directly (realCatalogFacets.test.ts).
 *
 * All work happens client-side over the already-fetched listing set (~2,675
 * rows) — same set that powers search/sort/count — so exact facet counts come
 * for free and nothing new hits the network. Counts are "add-this-value"
 * counts: each facet's tally is computed over the set filtered by every OTHER
 * active facet (and the search box), so selecting a make narrows the grade
 * counts while the make facet still shows every make. Standard faceted-search
 * semantics.
 *
 * Masking invariant (customer-safe): facets only ever key on fields the
 * `catalog_listing` view already exposes — make, ctia grade/label, carrier
 * code, lock_status, capacity, location name, and the caller's own-tier price.
 * Never raw vendor `grade` or `carrier_raw`.
 */
import { buildDisplayName, carrierLabel, type PricedRealListing } from '@/data/realCatalog';

export type FacetKey = 'make' | 'grade' | 'carrier' | 'lock' | 'capacity' | 'location' | 'price';

export const FACET_KEYS: readonly FacetKey[] = ['make', 'grade', 'carrier', 'lock', 'capacity', 'location', 'price'];

export type FacetState = Record<FacetKey, Set<string>>;

export function emptyFacetState(): FacetState {
  return { make: new Set(), grade: new Set(), carrier: new Set(), lock: new Set(), capacity: new Set(), location: new Set(), price: new Set() };
}

export function anyFacetActive(f: FacetState): boolean {
  return FACET_KEYS.some((k) => f[k].size > 0);
}

/** Refurb-phone tier-price bands (cents). Lower than the mock's MSRP bands —
 * graded stock skews well below retail. Null-priced items ("not priced for
 * your tier" / signed-out) go to a separate 'unpriced' bucket, never dropped. */
export const REAL_PRICE_BANDS: { id: string; label: string; test: (cents: number) => boolean }[] = [
  { id: 'lt200', label: 'Under $200', test: (c) => c < 20000 },
  { id: '200-500', label: '$200 – $500', test: (c) => c >= 20000 && c < 50000 },
  { id: '500-800', label: '$500 – $800', test: (c) => c >= 50000 && c < 80000 },
  { id: 'gt800', label: '$800 & up', test: (c) => c >= 80000 },
];
export const UNPRICED_BAND = 'unpriced';

function priceBandId(priceCents: number | null): string {
  if (priceCents === null) return UNPRICED_BAND;
  return REAL_PRICE_BANDS.find((b) => b.test(priceCents))?.id ?? UNPRICED_BAND;
}

/** The value(s) an item carries for a given facet axis. Single-valued for
 * everything except `location` (an item can be in stock at several). */
function facetValues(i: PricedRealListing, key: FacetKey): string[] {
  switch (key) {
    case 'make':
      return [i.make];
    case 'grade':
      return [i.ctiaLabel];
    case 'carrier':
      return [i.carrier];
    case 'lock':
      return [i.lockStatus];
    case 'capacity':
      return [i.capacity];
    case 'location':
      return i.locations.map((l) => l.name);
    case 'price':
      return [priceBandId(i.priceCents)];
  }
}

/** An item passes one facet axis if that axis has no selection, or the item's
 * value(s) intersect the selected set (OR within an axis). */
function passesFacet(i: PricedRealListing, key: FacetKey, selected: Set<string>): boolean {
  if (selected.size === 0) return true;
  return facetValues(i, key).some((v) => selected.has(v));
}

function passesSearch(i: PricedRealListing, needle: string): boolean {
  if (!needle) return true;
  const haystack = `${buildDisplayName(i)} ${i.make} ${i.sku} ${i.color ?? ''} ${i.ctiaLabel} ${carrierLabel(i.carrier)}`.toLowerCase();
  return haystack.includes(needle);
}

/** Passes search + every facet EXCEPT `exceptKey` (AND across axes). Used both
 * for the final filtered set (exceptKey = null) and for per-facet counts. */
function passesAllExcept(i: PricedRealListing, facets: FacetState, needle: string, exceptKey: FacetKey | null): boolean {
  if (!passesSearch(i, needle)) return false;
  for (const key of FACET_KEYS) {
    if (key === exceptKey) continue;
    if (!passesFacet(i, key, facets[key])) return false;
  }
  return true;
}

export type Sort = 'featured' | 'price-asc' | 'price-desc';

export interface FacetedResult {
  filtered: PricedRealListing[];
  /** Per-axis value→count over the set narrowed by all OTHER facets + search. */
  counts: Record<FacetKey, Map<string, number>>;
}

/**
 * Apply search + facets + sort, and compute add-this-value counts per axis.
 * `sort` leaves 'featured' in native (SKU) order; price sorts push null-priced
 * items to the end.
 */
export function computeFacetedCatalog(
  items: PricedRealListing[],
  facets: FacetState,
  q: string,
  sort: Sort,
): FacetedResult {
  const needle = q.trim().toLowerCase();

  // Final filtered set (all axes applied).
  let filtered = items.filter((i) => passesAllExcept(i, facets, needle, null));
  if (sort === 'price-asc' || sort === 'price-desc') {
    const sign = sort === 'price-asc' ? 1 : -1;
    filtered = [...filtered].sort(
      (a, b) => sign * ((a.priceCents ?? Number.MAX_SAFE_INTEGER) - (b.priceCents ?? Number.MAX_SAFE_INTEGER)),
    );
  }

  // Per-axis counts over the set filtered by every OTHER axis.
  const counts = {} as Record<FacetKey, Map<string, number>>;
  for (const key of FACET_KEYS) {
    const tally = new Map<string, number>();
    for (const i of items) {
      if (!passesAllExcept(i, facets, needle, key)) continue;
      for (const v of facetValues(i, key)) tally.set(v, (tally.get(v) ?? 0) + 1);
    }
    counts[key] = tally;
  }

  return { filtered, counts };
}
