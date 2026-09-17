import { describe, expect, it } from 'vitest';
import { allocateQty, allocationTotal, rankOffers } from './bestOffer';
import type { PricedRealListing } from '@/data/realCatalog';

function offer(sku: string, priceCents: number | null, totalQty: number): PricedRealListing {
  return {
    variantId: sku,
    sku,
    make: 'Apple',
    model: 'iPhone 13',
    capacity: '128GB',
    color: 'Blue',
    carrier: 'UNL',
    lockStatus: 'unlocked',
    ctiaGrade: 'B',
    ctiaLabel: 'Grade B',
    totalQty,
    locations: totalQty > 0 ? [{ id: sku, name: sku, qty: totalQty }] : [],
    priceCents,
    createdAt: '2026-01-01T00:00:00Z',
    soldQty: 0,
    imageUrl: null,
    description: null,
  };
}

const tx = offer('TX', 31000, 4);
const w23 = offer('W23', 29000, 3);
const tn = offer('TN', 33000, 50);
const soldOut = offer('OUT', 20000, 0);

describe('rankOffers', () => {
  it('puts in-stock first, then cheapest', () => {
    expect(rankOffers([tn, soldOut, tx, w23]).map((o) => o.sku)).toEqual(['W23', 'TX', 'TN', 'OUT']);
  });

  it('ranks by stock depth when nothing is priced (signed-out visitor)', () => {
    const a = offer('A', null, 2);
    const b = offer('B', null, 9);
    expect(rankOffers([a, b]).map((o) => o.sku)).toEqual(['B', 'A']);
  });
});

describe('allocateQty', () => {
  it('takes a small order entirely from the cheapest offer', () => {
    expect(allocateQty([tn, tx, w23], 2).map((l) => [l.offer.sku, l.qty])).toEqual([['W23', 2]]);
  });

  it('spills into the next-cheapest offer when stock runs out', () => {
    const lines = allocateQty([tn, tx, w23], 10);
    expect(lines.map((l) => [l.offer.sku, l.qty])).toEqual([['W23', 3], ['TX', 4], ['TN', 3]]);
    expect(allocationTotal(lines)).toBe(3 * 29000 + 4 * 31000 + 3 * 33000);
  });

  it('puts qty above total stock on the best offer instead of blocking (D5)', () => {
    expect(allocateQty([tx, w23], 10).map((l) => [l.offer.sku, l.qty])).toEqual([['W23', 6], ['TX', 4]]);
  });

  it('still returns a line when everything is sold out', () => {
    expect(allocateQty([soldOut], 3).map((l) => [l.offer.sku, l.qty])).toEqual([['OUT', 3]]);
  });

  it('returns nothing for zero qty or no offers', () => {
    expect(allocateQty([tx], 0)).toEqual([]);
    expect(allocateQty([], 5)).toEqual([]);
  });

  it('reports an unknown total when a line is unpriced', () => {
    expect(allocationTotal(allocateQty([offer('N', null, 5)], 2))).toBeNull();
  });
});
