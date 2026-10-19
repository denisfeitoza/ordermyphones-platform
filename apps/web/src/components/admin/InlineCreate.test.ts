import { describe, expect, it } from 'vitest';
import { capacityOptions, locationCode, normalizeCapacity } from './InlineCreate';

describe('normalizeCapacity', () => {
  it('writes sizes the catalog way', () => {
    expect(normalizeCapacity('64 GB')).toBe('64GB');
    expect(normalizeCapacity(' 1 tb ')).toBe('1TB');
    expect(normalizeCapacity('128GB')).toBe('128GB');
    expect(normalizeCapacity('N/A')).toBe('N/A');
  });
});

describe('capacityOptions', () => {
  it('merges standard and used sizes, dedupes, sorts by size', () => {
    const o = capacityOptions(['64 GB', '1GB', '24GB', '128GB']);
    expect(o.filter((c) => c === '64GB')).toHaveLength(1);
    expect(o.indexOf('1GB')).toBe(0);
    expect(o.indexOf('16GB')).toBeLessThan(o.indexOf('24GB'));
    expect(o.indexOf('24GB')).toBeLessThan(o.indexOf('32GB'));
    expect(o.indexOf('512GB')).toBeLessThan(o.indexOf('1TB'));
    expect(o[o.length - 1]).toBe('4TB');
  });
});

describe('locationCode', () => {
  it('builds a code from the name', () => {
    expect(locationCode(' Miami 2 ')).toBe('MIAMI-2');
    expect(locationCode('***')).toBe('');
  });
});
