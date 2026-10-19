import { describe, expect, it } from 'vitest';
import { stockLabel } from './stockDisplay';

describe('stockLabel', () => {
  it('exact shows the count', () => expect(stockLabel(7499, 'exact')).toBe('7,499'));
  it.each([
    [0, '0'],
    [3, '1–9'],
    [12, '10+'],
    [75, '50+'],
    [250, '100+'],
    [7499, '500+'],
  ])('ranges: %i -> %s', (q, label) => expect(stockLabel(q, 'ranges')).toBe(label));
});
