import type { PricedRealListing } from '@/data/realCatalog';
import type { Sort } from '@/lib/realCatalogFacets';
import { normalizeModel } from '@/lib/productImage';

/**
 * Model-level grouping for the storefront grid. The import yields one row per
 * sellable SKU (capacity × grade × carrier × color × lot), so a single model
 * like the iPhone 14 Pro Max spans 120+ SKUs; buyers browse by model and pick
 * options on the model page (/m/:slug). Pure, unit-tested.
 *
 * Spelling variants of the same model ("Galaxy S24 Ultra" / "Galaxy S24 Ultra
 * 5G") fold into one group through normalizeModel(); the group takes the
 * spelling that carries the most stock.
 */
export interface ModelGroup {
  slug: string;
  make: string;
  model: string;
  imageUrl: string | null;
  offers: PricedRealListing[];
  totalQty: number;
  /** Lowest tier price among in-stock offers (any priced offer if none in stock); null when unpriced. */
  fromPriceCents: number | null;
  capacities: string[];
  conditions: string[];
  locations: string[];
  soldQty: number;
  newestAt: number;
}

export function modelSlug(make: string, model: string): string {
  return `${make} ${normalizeModel(model)}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** "64GB" < "128GB" < "1TB" — numeric, not lexicographic. */
function capacityRank(capacity: string): number {
  const m = capacity.trim().match(/^(\d+(?:\.\d+)?)\s*(GB|TB)$/i);
  if (!m) return Number.MAX_SAFE_INTEGER;
  return Number(m[1]) * (m[2].toUpperCase() === 'TB' ? 1024 : 1);
}

export function sortCapacities(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => capacityRank(a) - capacityRank(b) || a.localeCompare(b));
}

function minPrice(offers: PricedRealListing[]): number | null {
  let min: number | null = null;
  for (const o of offers) if (o.priceCents !== null && (min === null || o.priceCents < min)) min = o.priceCents;
  return min;
}

/** Groups listings by model, preserving the order in which models first appear. */
export function groupByModel(items: PricedRealListing[]): ModelGroup[] {
  const buckets = new Map<string, PricedRealListing[]>();
  for (const it of items) {
    const slug = modelSlug(it.make, it.model);
    const bucket = buckets.get(slug);
    if (bucket) bucket.push(it);
    else buckets.set(slug, [it]);
  }

  return [...buckets.entries()].map(([slug, offers]) => {
    const qtyBySpelling = new Map<string, number>();
    for (const o of offers) qtyBySpelling.set(o.model, (qtyBySpelling.get(o.model) ?? 0) + o.totalQty);
    const model = [...qtyBySpelling.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const inStock = offers.filter((o) => o.totalQty > 0);

    return {
      slug,
      make: offers[0].make,
      model,
      imageUrl: offers.find((o) => o.imageUrl)?.imageUrl ?? null,
      offers,
      totalQty: offers.reduce((sum, o) => sum + o.totalQty, 0),
      fromPriceCents: minPrice(inStock) ?? minPrice(offers),
      capacities: sortCapacities(offers.map((o) => o.capacity)),
      conditions: [...new Set(offers.map((o) => o.ctiaLabel))],
      locations: [...new Set(offers.flatMap((o) => o.locations.filter((l) => l.qty > 0).map((l) => l.name)))],
      soldQty: offers.reduce((sum, o) => sum + o.soldQty, 0),
      newestAt: Math.max(...offers.map((o) => Date.parse(o.createdAt) || 0)),
    };
  });
}

/** Same sort options as the SKU list, applied at model level. 'featured' puts
 * the deepest stock first (the SKU list's native order is alphabetical by SKU,
 * which would lead with Galaxy S22s); price sorts use the "from" price, unpriced last. */
export function sortGroups(groups: ModelGroup[], sort: Sort): ModelGroup[] {
  const unpriced = Number.MAX_SAFE_INTEGER;
  switch (sort) {
    case 'price-asc':
      return [...groups].sort((a, b) => (a.fromPriceCents ?? unpriced) - (b.fromPriceCents ?? unpriced));
    case 'price-desc':
      return [...groups].sort((a, b) => {
        if (a.fromPriceCents === null) return b.fromPriceCents === null ? 0 : 1;
        if (b.fromPriceCents === null) return -1;
        return b.fromPriceCents - a.fromPriceCents;
      });
    case 'newest':
      return [...groups].sort((a, b) => b.newestAt - a.newestAt);
    case 'best-selling':
      return [...groups].sort((a, b) => b.soldQty - a.soldQty);
    default:
      return [...groups].sort((a, b) => b.totalQty - a.totalQty);
  }
}
