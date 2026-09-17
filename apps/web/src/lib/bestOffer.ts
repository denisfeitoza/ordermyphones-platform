import type { PricedRealListing } from '@/data/realCatalog';

/**
 * "Best value per stock" for one configuration (model page). The same
 * configuration can exist as several SKUs — different lots, suppliers or
 * warehouses — at different tier prices (up to ~$150 apart in the live data).
 * Pure, unit-tested.
 */

/** In stock first, then cheapest (unpriced last), then deepest stock, then SKU for stability. */
export function rankOffers(offers: PricedRealListing[]): PricedRealListing[] {
  const unpriced = Number.MAX_SAFE_INTEGER;
  return [...offers].sort(
    (a, b) =>
      Number(b.totalQty > 0) - Number(a.totalQty > 0) ||
      (a.priceCents ?? unpriced) - (b.priceCents ?? unpriced) ||
      b.totalQty - a.totalQty ||
      a.sku.localeCompare(b.sku),
  );
}

export interface OfferAllocation {
  offer: PricedRealListing;
  qty: number;
}

/**
 * Fill `qty` from the cheapest offers first, taking each offer up to its live
 * stock. Ordering above stock is allowed (D5: the order holds no stock and is
 * reconciled at approval), so any remainder goes on the best-ranked offer
 * rather than blocking the buyer.
 */
export function allocateQty(offers: PricedRealListing[], qty: number): OfferAllocation[] {
  const want = Math.max(0, Math.floor(qty));
  const ranked = rankOffers(offers);
  if (want === 0 || ranked.length === 0) return [];

  const lines: OfferAllocation[] = [];
  let left = want;
  for (const offer of ranked) {
    if (left === 0 || offer.totalQty <= 0) break;
    const take = Math.min(left, offer.totalQty);
    lines.push({ offer, qty: take });
    left -= take;
  }
  if (left > 0) {
    if (lines.length > 0) lines[0].qty += left;
    else lines.push({ offer: ranked[0], qty: left });
  }
  return lines;
}

/** Total in cents, or null when any allocated line is unpriced. */
export function allocationTotal(lines: OfferAllocation[]): number | null {
  let total = 0;
  for (const l of lines) {
    if (l.offer.priceCents === null) return null;
    total += l.offer.priceCents * l.qty;
  }
  return total;
}
