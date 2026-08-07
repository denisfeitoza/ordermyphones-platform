import { describe, expect, it } from 'vitest';
import { parseQuickOrder, resolveQuickOrder } from './quickOrder';
import type { PricedRealListing } from '@/data/realCatalog';

function item(sku: string, priceCents: number | null): PricedRealListing {
  return {
    variantId: sku, sku, make: 'Apple', model: 'iPhone 13', capacity: '128GB', color: 'Black',
    carrier: 'UNL', lockStatus: 'unlocked', ctiaGrade: 'A', ctiaLabel: 'Grade A',
    totalQty: 5, locations: [{ id: 'tx', name: 'TX1', qty: 5 }], priceCents,
  };
}

describe('parseQuickOrder', () => {
  it('parses comma, tab, and space separators', () => {
    const { lines } = parseQuickOrder('SKU-A,3\nSKU-B\t2\nSKU-C 4');
    expect(lines).toEqual([
      { raw: 'SKU-A,3', sku: 'SKU-A', qty: 3 },
      { raw: 'SKU-B\t2', sku: 'SKU-B', qty: 2 },
      { raw: 'SKU-C 4', sku: 'SKU-C', qty: 4 },
    ]);
  });

  it('treats a bare SKU as qty 1 and skips blank lines', () => {
    const { lines } = parseQuickOrder('  SKU-A \n\n\n');
    expect(lines).toEqual([{ raw: 'SKU-A', sku: 'SKU-A', qty: 1 }]);
  });

  it('uppercases SKUs for canonical matching', () => {
    const { lines } = parseQuickOrder('airpodsmax2usbc-a3454 2');
    expect(lines[0].sku).toBe('AIRPODSMAX2USBC-A3454');
  });

  it('flags a line whose qty is not a positive integer as bad_line', () => {
    const { lines, problems } = parseQuickOrder('SKU-A abc\nSKU-B 0');
    expect(lines).toEqual([]);
    expect(problems).toEqual([
      { raw: 'SKU-A abc', reason: 'bad_line' },
      { raw: 'SKU-B 0', reason: 'bad_line' },
    ]);
  });
});

describe('resolveQuickOrder', () => {
  const CATALOG = [item('SKU-A', 30000), item('SKU-B', 45000), item('SKU-NOPRICE', null)];

  it('resolves priced, in-catalog SKUs and aggregates duplicates', () => {
    const { lines } = parseQuickOrder('SKU-A 3\nSKU-A 2\nSKU-B 1');
    const { resolved, problems } = resolveQuickOrder(lines, CATALOG);
    expect(problems).toEqual([]);
    expect(resolved.map((r) => [r.item.sku, r.qty])).toEqual([['SKU-A', 5], ['SKU-B', 1]]);
  });

  it('surfaces unknown SKUs as not_found, never dropping them', () => {
    const { lines } = parseQuickOrder('SKU-A 1\nSKU-GHOST 9');
    const { resolved, problems } = resolveQuickOrder(lines, CATALOG);
    expect(resolved.map((r) => r.item.sku)).toEqual(['SKU-A']);
    expect(problems).toEqual([{ raw: 'SKU-GHOST', sku: 'SKU-GHOST', reason: 'not_found' }]);
  });

  it('surfaces in-catalog-but-unpriced SKUs as unpriced', () => {
    const { lines } = parseQuickOrder('SKU-NOPRICE 4');
    const { resolved, problems } = resolveQuickOrder(lines, CATALOG);
    expect(resolved).toEqual([]);
    expect(problems).toEqual([{ raw: 'SKU-NOPRICE', sku: 'SKU-NOPRICE', reason: 'unpriced' }]);
  });

  it('matches case-insensitively against canonical SKUs', () => {
    const { lines } = parseQuickOrder('sku-a 2');
    const { resolved } = resolveQuickOrder(lines, CATALOG);
    expect(resolved).toEqual([{ item: CATALOG[0], qty: 2 }]);
  });
});
