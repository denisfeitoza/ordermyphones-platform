import { describe, expect, it } from 'vitest';
import { pickFeatured } from './realCatalogFacets';

const mk = (sku: string, model: string, totalQty: number, soldQty = 0) => ({ sku, model, totalQty, soldQty });

const CATALOG = [
  mk('AIRPODS-1', 'AirPods Max 2 USB-C', 15, 0),
  mk('AIRPODS-2', 'AirPods Max 2 USB-C', 4, 0),
  mk('IP13-A', 'iPhone 13 Pro Max', 30, 210),
  mk('IP13-B', 'iPhone 13 Pro Max', 12, 40),
  mk('S23-A', 'Galaxy S23 Plus 5G', 8, 50),
  mk('IP11-A', 'iPhone 11', 0, 500),
  mk('IP12-A', 'iPhone 12', 3, 0),
  mk('PIX-A', 'Pixel 8', 9, 0),
];

describe('pickFeatured', () => {
  it('puts admin-pinned SKUs first, in pin order, even accessories', () => {
    const out = pickFeatured(CATALOG, { skus: ['airpods-2', 'S23-A'], models: [] });
    expect(out.slice(0, 2).map((i) => i.sku)).toEqual(['AIRPODS-2', 'S23-A']);
  });

  it('then pinned models (one in-stock variant each)', () => {
    const out = pickFeatured(CATALOG, { skus: [], models: ['Pixel 8'] });
    expect(out[0].sku).toBe('PIX-A');
  });

  it('fills with best sellers that are in stock, one card per model, no accessories', () => {
    const out = pickFeatured(CATALOG, null);
    const skus = out.map((i) => i.sku);
    expect(skus[0]).toBe('IP13-A'); // 210 sold, in stock
    expect(skus[1]).toBe('S23-A'); // 50 sold
    expect(skus).not.toContain('IP13-B'); // same model as IP13-A
    expect(skus).not.toContain('IP11-A'); // out of stock
    expect(skus).not.toContain('AIRPODS-1'); // accessory
  });

  it('respects the limit and never duplicates a SKU', () => {
    const out = pickFeatured(CATALOG, { skus: ['IP13-A'], models: ['iPhone 13 Pro Max'] }, 3);
    expect(out).toHaveLength(3);
    expect(new Set(out.map((i) => i.sku)).size).toBe(3);
  });

  it('falls back to anything when the catalog is only accessories', () => {
    const only = [mk('A', 'AirPods Pro', 2), mk('B', 'Apple Watch', 1)];
    expect(pickFeatured(only, null)).toHaveLength(2);
  });
});
