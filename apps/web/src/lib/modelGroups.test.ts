import { describe, expect, it } from 'vitest';
import { groupByModel, modelSlug, sortCapacities, sortGroups } from './modelGroups';
import type { PricedRealListing } from '@/data/realCatalog';

function listing(over: Partial<PricedRealListing>): PricedRealListing {
  return {
    variantId: over.sku ?? 'v',
    sku: 'SKU',
    make: 'Apple',
    model: 'iPhone 14 Pro Max',
    capacity: '128GB',
    color: 'Black',
    carrier: 'UNL',
    lockStatus: 'unlocked',
    ctiaGrade: 'B',
    ctiaLabel: 'Grade B',
    totalQty: 5,
    locations: [{ id: 'tx', name: 'Texas', qty: 5 }],
    priceCents: 40000,
    createdAt: '2026-01-01T00:00:00Z',
    soldQty: 0,
    imageUrl: null,
    description: null,
    ...over,
  };
}

describe('modelSlug', () => {
  it('folds supplier spellings of one model onto one slug', () => {
    expect(modelSlug('Samsung', 'Galaxy S24 Ultra 5G')).toBe('samsung-galaxy-s24-ultra');
    expect(modelSlug('Samsung', 'Galaxy S24 Ultra')).toBe('samsung-galaxy-s24-ultra');
    expect(modelSlug('Samsung', 'Galaxy S22+ 5G')).toBe(modelSlug('Samsung', 'Galaxy S22 Plus 5G'));
  });
});

describe('sortCapacities', () => {
  it('orders numerically with TB after GB', () => {
    expect(sortCapacities(['1TB', '128GB', '64GB', '512GB', '128GB'])).toEqual(['64GB', '128GB', '512GB', '1TB']);
  });
});

describe('groupByModel', () => {
  const items = [
    listing({ sku: 'A', capacity: '256GB', priceCents: 52000, totalQty: 3, locations: [{ id: 'tx', name: 'Texas', qty: 3 }] }),
    listing({ sku: 'B', capacity: '128GB', priceCents: 41000, totalQty: 0, locations: [] }),
    listing({ sku: 'C', capacity: '128GB', priceCents: 44000, ctiaLabel: 'Grade A', totalQty: 9, locations: [{ id: 'w', name: 'Warehouse 23', qty: 9 }], imageUrl: '/x.webp' }),
    listing({ sku: 'D', make: 'Samsung', model: 'Galaxy S24 Ultra', priceCents: 60000, totalQty: 1 }),
    listing({ sku: 'E', make: 'Samsung', model: 'Galaxy S24 Ultra 5G', priceCents: null, totalQty: 7 }),
  ];
  const groups = groupByModel(items);

  it('makes one group per model, in first-appearance order', () => {
    expect(groups.map((g) => g.slug)).toEqual(['apple-iphone-14-pro-max', 'samsung-galaxy-s24-ultra']);
  });

  it('prices "from" the cheapest IN-STOCK offer, not a sold-out one', () => {
    expect(groups[0].fromPriceCents).toBe(44000);
  });

  it('aggregates stock, options, locations and image', () => {
    const g = groups[0];
    expect(g.totalQty).toBe(12);
    expect(g.capacities).toEqual(['128GB', '256GB']);
    expect(g.conditions).toEqual(['Grade B', 'Grade A']);
    expect(g.locations).toEqual(['Texas', 'Warehouse 23']);
    expect(g.imageUrl).toBe('/x.webp');
  });

  it('names a folded group after the spelling with the most stock and ignores unpriced offers for "from"', () => {
    expect(groups[1].model).toBe('Galaxy S24 Ultra 5G');
    expect(groups[1].offers).toHaveLength(2);
    expect(groups[1].fromPriceCents).toBe(60000);
  });

  it('features the deepest stock first', () => {
    expect(sortGroups(groups, 'featured').map((g) => g.slug)).toEqual(['apple-iphone-14-pro-max', 'samsung-galaxy-s24-ultra']);
    expect(sortGroups([...groups].reverse(), 'featured')[0].slug).toBe('apple-iphone-14-pro-max');
  });

  it('sorts by from-price with unpriced groups last in both directions', () => {
    const unpriced = { ...groups[1], slug: 'none', fromPriceCents: null };
    expect(sortGroups([unpriced, ...groups], 'price-asc').map((g) => g.slug)).toEqual(['apple-iphone-14-pro-max', 'samsung-galaxy-s24-ultra', 'none']);
    expect(sortGroups([unpriced, ...groups], 'price-desc').map((g) => g.slug)).toEqual(['samsung-galaxy-s24-ultra', 'apple-iphone-14-pro-max', 'none']);
  });
});
