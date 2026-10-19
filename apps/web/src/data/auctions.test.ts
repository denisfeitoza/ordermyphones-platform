import { describe, expect, it } from 'vitest';
import { isOpen, mapLotRows } from './auctions';

describe('mapLotRows', () => {
  it('finds lot, description, quantity and grade columns and keeps the rest', () => {
    const [a] = mapLotRows([{ 'Lot #': 'A-17', Description: 'iPhone 13 128GB mix', Qty: '1,200', Grade: 'B', Carrier: 'VZW' }]);
    expect(a).toMatchObject({ lot_ref: 'A-17', title: 'iPhone 13 128GB mix', qty: 1200, grade: 'B', details: { Carrier: 'VZW' } });
  });
  it('numbers lots when the sheet has no lot column', () => {
    expect(mapLotRows([{ Model: 'Galaxy S22' }, { Model: 'Galaxy S23' }]).map((l) => l.lot_ref)).toEqual(['L1', 'L2']);
  });
});

describe('isOpen', () => {
  it('closes at closes_at, not at the supplier deadline', () => {
    const now = Date.parse('2026-10-19T12:00:00Z');
    expect(isOpen({ status: 'open', closes_at: '2026-10-19T12:10:00Z' }, now)).toBe(true);
    expect(isOpen({ status: 'open', closes_at: '2026-10-19T11:59:00Z' }, now)).toBe(false);
    expect(isOpen({ status: 'draft', closes_at: '2026-10-19T13:00:00Z' }, now)).toBe(false);
  });
});
