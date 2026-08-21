import { describe, expect, it } from 'vitest';
import { computeFacetedCatalog, emptyFacetState, anyFacetActive, UNPRICED_BAND } from './realCatalogFacets';
import type { PricedRealListing } from '@/data/realCatalog';

function listing(over: Partial<PricedRealListing>): PricedRealListing {
  return {
    variantId: over.sku ?? 'v',
    sku: 'SKU',
    make: 'Apple',
    model: 'iPhone 13',
    capacity: '128GB',
    color: 'Black',
    carrier: 'UNL',
    lockStatus: 'unlocked',
    ctiaGrade: 'A',
    ctiaLabel: 'Grade A',
    totalQty: 5,
    locations: [{ id: 'tx', name: 'TX1', qty: 5 }],
    priceCents: 30000,
    createdAt: '2026-01-01T00:00:00Z',
    soldQty: 0,
    ...over,
  };
}

const SET = [
  listing({ sku: 'A', make: 'Apple', ctiaLabel: 'Grade A', capacity: '128GB', priceCents: 30000, locations: [{ id: 'tx', name: 'TX1', qty: 3 }] }),
  listing({ sku: 'B', make: 'Apple', ctiaLabel: 'Grade B', capacity: '256GB', priceCents: 60000, locations: [{ id: 'tx', name: 'TX1', qty: 2 }, { id: 'tn', name: 'TN1', qty: 1 }] }),
  listing({ sku: 'C', make: 'Samsung', ctiaLabel: 'Grade A', capacity: '128GB', priceCents: 15000, locations: [{ id: 'tn', name: 'TN1', qty: 4 }] }),
  listing({ sku: 'D', make: 'Samsung', ctiaLabel: 'New', capacity: '512GB', priceCents: null, locations: [{ id: 'tx', name: 'TX1', qty: 9 }] }),
];

describe('computeFacetedCatalog', () => {
  it('with no facets, returns everything and full counts', () => {
    const { filtered, counts } = computeFacetedCatalog(SET, emptyFacetState(), '', 'featured');
    expect(filtered).toHaveLength(4);
    expect(counts.make.get('Apple')).toBe(2);
    expect(counts.make.get('Samsung')).toBe(2);
    // location is multi-valued: B counts toward both TX1 and TN1
    expect(counts.location.get('TX1')).toBe(3); // A, B, D
    expect(counts.location.get('TN1')).toBe(2); // B, C
  });

  it('filters by a facet and narrows OTHER facet counts (add-this-value semantics)', () => {
    const f = emptyFacetState();
    f.make.add('Apple');
    const { filtered, counts } = computeFacetedCatalog(SET, f, '', 'featured');
    expect(filtered.map((i) => i.sku).sort()).toEqual(['A', 'B']);
    // grade counts now reflect Apple-only
    expect(counts.grade.get('Grade A')).toBe(1); // only A
    expect(counts.grade.get('Grade B')).toBe(1); // only B
    expect(counts.grade.get('New')).toBeUndefined(); // Samsung D excluded
    // BUT the make axis itself still shows both (its own selection is ignored in its counts)
    expect(counts.make.get('Samsung')).toBe(2);
  });

  it('multi-select within an axis is a union (OR)', () => {
    const f = emptyFacetState();
    f.grade.add('Grade A');
    f.grade.add('New');
    const { filtered } = computeFacetedCatalog(SET, f, '', 'featured');
    expect(filtered.map((i) => i.sku).sort()).toEqual(['A', 'C', 'D']);
  });

  it('location facet matches an item in stock at any selected location', () => {
    const f = emptyFacetState();
    f.location.add('TN1');
    const { filtered } = computeFacetedCatalog(SET, f, '', 'featured');
    expect(filtered.map((i) => i.sku).sort()).toEqual(['B', 'C']); // both stock TN1
  });

  it('null-priced items land in the unpriced band, never dropped', () => {
    const { counts } = computeFacetedCatalog(SET, emptyFacetState(), '', 'featured');
    expect(counts.price.get(UNPRICED_BAND)).toBe(1); // D
    const f = emptyFacetState();
    f.price.add(UNPRICED_BAND);
    const { filtered } = computeFacetedCatalog(SET, f, '', 'featured');
    expect(filtered.map((i) => i.sku)).toEqual(['D']);
  });

  it('price sort pushes null-priced to the end', () => {
    const { filtered } = computeFacetedCatalog(SET, emptyFacetState(), '', 'price-asc');
    expect(filtered.map((i) => i.sku)).toEqual(['C', 'A', 'B', 'D']); // 150,300,600,null
  });

  it('search narrows both the filtered set and the counts', () => {
    const f = emptyFacetState();
    const { filtered } = computeFacetedCatalog(SET, f, 'samsung', 'featured');
    expect(filtered.map((i) => i.sku).sort()).toEqual(['C', 'D']);
  });

  it('anyFacetActive reflects selection state', () => {
    const f = emptyFacetState();
    expect(anyFacetActive(f)).toBe(false);
    f.carrier.add('UNL');
    expect(anyFacetActive(f)).toBe(true);
  });

  it('best-selling sorts by units sold, descending', () => {
    const set = [listing({ sku: 'X', soldQty: 2 }), listing({ sku: 'Y', soldQty: 40 }), listing({ sku: 'Z', soldQty: 10 })];
    const { filtered } = computeFacetedCatalog(set, emptyFacetState(), '', 'best-selling');
    expect(filtered.map((i) => i.sku)).toEqual(['Y', 'Z', 'X']);
  });

  it('newest sorts by created date, descending', () => {
    const set = [
      listing({ sku: 'old', createdAt: '2025-01-01T00:00:00Z' }),
      listing({ sku: 'new', createdAt: '2026-06-01T00:00:00Z' }),
      listing({ sku: 'mid', createdAt: '2025-09-01T00:00:00Z' }),
    ];
    const { filtered } = computeFacetedCatalog(set, emptyFacetState(), '', 'newest');
    expect(filtered.map((i) => i.sku)).toEqual(['new', 'mid', 'old']);
  });
});
