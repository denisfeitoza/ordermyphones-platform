import { describe, expect, it } from 'vitest';
import { expandCartToOrderItems } from './orderItems';
import { allocationSum, allocationValid } from '@/components/store/CartLineLocations';

describe('expandCartToOrderItems', () => {
  it('sends a single system-decide item for a line with no split', () => {
    expect(expandCartToOrderItems([{ variantId: 'v1', qty: 5 }])).toEqual([{ variant_id: 'v1', qty: 5 }]);
  });

  it('expands a per-location split into one item per (variant, location)', () => {
    const out = expandCartToOrderItems([
      { variantId: 'v1', qty: 5, allocations: [{ locationId: 'A', qty: 3 }, { locationId: 'B', qty: 2 }] },
    ]);
    expect(out).toEqual([
      { variant_id: 'v1', location_id: 'A', qty: 3 },
      { variant_id: 'v1', location_id: 'B', qty: 2 },
    ]);
  });

  it('mixes split and non-split lines correctly', () => {
    const out = expandCartToOrderItems([
      { variantId: 'v1', qty: 2 },
      { variantId: 'v2', qty: 4, allocations: [{ locationId: 'A', qty: 4 }] },
    ]);
    expect(out).toEqual([
      { variant_id: 'v1', qty: 2 },
      { variant_id: 'v2', location_id: 'A', qty: 4 },
    ]);
  });

  it('treats an empty allocations array as system-decide', () => {
    expect(expandCartToOrderItems([{ variantId: 'v1', qty: 3, allocations: [] }])).toEqual([{ variant_id: 'v1', qty: 3 }]);
  });
});

describe('allocation validity', () => {
  it('a line with no split is always valid', () => {
    expect(allocationValid({ qty: 5 })).toBe(true);
    expect(allocationValid({ qty: 5, allocations: [] })).toBe(true);
  });

  it('a split is valid only when it sums exactly to qty', () => {
    expect(allocationValid({ qty: 5, allocations: [{ locationId: 'A', qty: 3 }, { locationId: 'B', qty: 2 }] })).toBe(true);
    expect(allocationValid({ qty: 5, allocations: [{ locationId: 'A', qty: 3 }] })).toBe(false); // under
    expect(allocationValid({ qty: 5, allocations: [{ locationId: 'A', qty: 6 }] })).toBe(false); // over
  });

  it('allocationSum totals the split', () => {
    expect(allocationSum([{ locationId: 'A', qty: 3 }, { locationId: 'B', qty: 2 }])).toBe(5);
    expect(allocationSum(undefined)).toBe(0);
  });
});
