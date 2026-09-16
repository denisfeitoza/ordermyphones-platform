import { describe, expect, it } from 'vitest';
import { normalizeModel, resolveProductImage } from './productImage';

describe('normalizeModel', () => {
  it.each([
    ['Galaxy S22+ 5G', 'galaxy s22 plus'],
    ['Galaxy S22 Plus 5G', 'galaxy s22 plus'],
    ['Galaxy S24 Fan Edition 5G', 'galaxy s24 fe'],
    ['Galaxy S24 FE', 'galaxy s24 fe'],
    ['Galaxy Z Fold 5 5G', 'galaxy z fold5'],
    ['Galaxy Z Fold5', 'galaxy z fold5'],
    ['Galaxy Z Flip 6 5G', 'galaxy z flip6'],
    ['Pixel 10 Pro 5G', 'pixel 10 pro'],
    ['  iPhone 16e ', 'iphone 16e'],
  ])('%s → %s', (raw, key) => {
    expect(normalizeModel(raw)).toBe(key);
  });
});

describe('resolveProductImage', () => {
  it('returns the render for the exact model, never a sibling', () => {
    expect(resolveProductImage('iPhone 16')).toBe('/generated/catalog/iphone-16.webp');
    expect(resolveProductImage('iPhone 16 Pro Max')).toBe('/generated/catalog/iphone-16-pro-max.webp');
  });

  it('folds supplier spellings onto the same render', () => {
    expect(resolveProductImage('Galaxy S24 Ultra 5G')).toBe(resolveProductImage('Galaxy S24 Ultra'));
    expect(resolveProductImage('Galaxy Z Flip 6 5G')).toBe('/generated/catalog/galaxy-z-flip6.webp');
  });

  it('returns null instead of guessing a related model', () => {
    expect(resolveProductImage('iPhone 16 Pro Max Ultra')).toBeNull();
    expect(resolveProductImage('UI Demo Phone')).toBeNull();
    expect(resolveProductImage('')).toBeNull();
  });
});
