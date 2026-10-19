import { describe, expect, it } from 'vitest';
import { paymentState } from './payment';

describe('paymentState', () => {
  const now = Date.parse('2026-10-19T12:00:00Z');
  const base = { status: 'approved', paymentStatus: 'unpaid' as const, invoicedAt: '2026-10-01T00:00:00Z', dueAt: '2026-10-31T00:00:00Z' };
  it('pending and rejected orders are not invoiced', () => {
    expect(paymentState({ ...base, status: 'pending' }, now)).toBe('not_invoiced');
    expect(paymentState({ ...base, status: 'rejected' }, now)).toBe('not_invoiced');
  });
  it('unpaid before the due date, overdue after it, paid wins', () => {
    expect(paymentState(base, now)).toBe('unpaid');
    expect(paymentState({ ...base, dueAt: '2026-10-18T00:00:00Z' }, now)).toBe('overdue');
    expect(paymentState({ ...base, dueAt: '2026-10-18T00:00:00Z', paymentStatus: 'paid' }, now)).toBe('paid');
  });
  it('COD has no due date until it ships', () => {
    expect(paymentState({ ...base, dueAt: null }, now)).toBe('unpaid');
  });
});
