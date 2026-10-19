import { describe, expect, it } from 'vitest';
import { approvedTotalCents, isShortOrder, orderUnits, orderValueCents } from './orderTotals';

const lines = [
  { qtyRequested: 10, qtyApproved: 7, unitPriceCents: 1000 },
  { qtyRequested: 2, qtyApproved: 2, unitPriceCents: 500 },
];

describe('order totals', () => {
  it('pending uses the requested subtotal', () => expect(orderValueCents('pending', 11000, lines)).toBe(11000));
  it('partial approval counts approved units only', () => {
    expect(approvedTotalCents(lines)).toBe(8000);
    expect(orderValueCents('partially_approved', 11000, lines)).toBe(8000);
    expect(orderValueCents('shipped', 11000, lines)).toBe(8000);
    expect(isShortOrder('partially_approved', 11000, lines)).toBe(true);
    expect(orderUnits('partially_approved', lines)).toBe(9);
  });
  it('rejected and cancelled are worth 0', () => {
    expect(orderValueCents('rejected', 11000, lines)).toBe(0);
    expect(orderValueCents('cancelled', 11000, lines)).toBe(0);
    expect(orderUnits('rejected', lines)).toBe(0);
  });
  it('null approved qty counts as 0', () => expect(approvedTotalCents([{ qtyRequested: 3, qtyApproved: null, unitPriceCents: 100 }])).toBe(0));
});
