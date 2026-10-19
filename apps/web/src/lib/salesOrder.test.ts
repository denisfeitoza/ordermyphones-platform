import { describe, expect, it } from 'vitest';
import { salesOrdersQuickBooksCsv, soNumber, type SalesOrderDoc } from './salesOrder';

const doc: SalesOrderDoc & { customer: string } = {
  number: soNumber('abcdef12-0000-0000-0000-000000000000'),
  orderDate: '2026-10-01T12:00:00Z',
  invoiceDate: '2026-10-02T12:00:00Z',
  dueDate: '2026-11-01T12:00:00Z',
  terms: 'net30',
  status: 'approved',
  billTo: ['Acme'],
  shipTo: [],
  shippingMethod: 'omp',
  shippingAccount: null,
  shippingCents: 2500,
  note: '=PO 7',
  lines: [{ sku: 'IP13-128', description: 'iPhone 13 128GB', qty: 3, unitCents: 30000 }],
  paid: false,
  isTest: false,
  customer: 'Acme Wireless',
};

describe('salesOrdersQuickBooksCsv', () => {
  it('writes one row per line plus a shipping line, with safe cells', () => {
    const csv = salesOrdersQuickBooksCsv([doc]).split('\n');
    expect(csv).toHaveLength(3);
    expect(csv[0]).toContain('"InvoiceNo"');
    expect(csv[1]).toContain('"SO-ABCDEF12"');
    expect(csv[1]).toContain('"900.00"');
    expect(csv[1]).toContain(`"'=PO 7"`);
    expect(csv[2]).toContain('"Shipping"');
    expect(csv[2]).toContain('"25.00"');
  });
});
