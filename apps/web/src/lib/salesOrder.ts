/**
 * Sales Order (the invoice / purchase-order document of RFC-001 §4) as a PDF,
 * and the QuickBooks invoice-import CSV.
 *
 * DRAFT TEMPLATE: a generic layout until Order My Phones sends its QuickBooks
 * Sales Order template (RFC Q3) — then this file follows that layout.
 */
import type { CompanyProfile } from '@/data/companyProfile';
import { csvCell } from '@/lib/export';
import { TERMS_LABEL, SHIPPING_LABEL, type PaymentTerms, type ShippingMethod } from '@/lib/payment';

export interface SalesOrderLine {
  sku: string;
  description: string;
  qty: number;
  unitCents: number;
}

export interface SalesOrderDoc {
  number: string;
  orderDate: string;
  invoiceDate: string | null;
  dueDate: string | null;
  terms: PaymentTerms | null;
  status: string;
  billTo: string[];
  shipTo: string[];
  shippingMethod: ShippingMethod;
  shippingAccount: string | null;
  shippingCents: number;
  note: string | null;
  lines: SalesOrderLine[];
  paid: boolean;
  isTest: boolean;
}

const usd = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—');

export const soNumber = (orderId: string) => `SO-${orderId.slice(0, 8).toUpperCase()}`;

export function goodsCents(lines: SalesOrderLine[]): number {
  return lines.reduce((s, l) => s + l.qty * l.unitCents, 0);
}

export async function exportSalesOrderPdf(d: SalesOrderDoc, company: CompanyProfile) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const muted = () => doc.setTextColor(110, 110, 120);
  const ink = () => doc.setTextColor(20, 20, 28);

  // Header: company left, document right.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  ink();
  doc.text(company.legal_name || 'Order My Phones', 40, 50);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  muted();
  const companyLines = [company.address, [company.phone, company.email].filter(Boolean).join(' · '), company.website].filter(Boolean) as string[];
  doc.text(companyLines.flatMap((l) => doc.splitTextToSize(l, 260) as string[]), 40, 66);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  ink();
  doc.text('SALES ORDER', W - 40, 50, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const meta: [string, string][] = [
    ['Number', d.number],
    ['Order date', fmt(d.orderDate)],
    ['Invoice date', fmt(d.invoiceDate)],
    ['Due date', d.terms === 'cod' && !d.dueDate ? 'On delivery' : fmt(d.dueDate)],
    ['Terms', d.terms ? TERMS_LABEL[d.terms] : '—'],
    ['Status', d.paid ? 'PAID' : d.status],
  ];
  meta.forEach(([k, v], i) => {
    muted();
    doc.text(k, W - 200, 68 + i * 13);
    ink();
    doc.text(v, W - 40, 68 + i * 13, { align: 'right' });
  });

  // Bill to / ship to.
  let y = 160;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  muted();
  doc.text('BILL TO', 40, y);
  doc.text('SHIP TO', W / 2, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  ink();
  doc.text(d.billTo.length ? d.billTo : ['—'], 40, y + 14);
  doc.text(d.shipTo.length ? d.shipTo : ['—'], W / 2, y + 14);
  y += 14 + Math.max(d.billTo.length, d.shipTo.length, 1) * 12 + 6;
  muted();
  doc.setFontSize(9);
  doc.text(`Shipping: ${SHIPPING_LABEL[d.shippingMethod]}${d.shippingAccount ? ` (${d.shippingAccount})` : ''}`, 40, y);
  if (d.note) doc.text(doc.splitTextToSize(`PO / note: ${d.note}`, W - 80) as string[], 40, y + 12);
  y += d.note ? 30 : 16;

  autoTable(doc, {
    startY: y,
    head: [['SKU', 'Description', 'Qty', 'Unit price', 'Amount']],
    body: d.lines.map((l) => [l.sku, l.description, String(l.qty), usd(l.unitCents), usd(l.qty * l.unitCents)]),
    headStyles: { fillColor: [20, 20, 28], textColor: 255, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 150, fontSize: 7.5 }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    styles: { fontSize: 9, cellPadding: 5 },
    theme: 'striped',
  });
  let fy = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;
  const goods = goodsCents(d.lines);
  const totals: [string, string][] = [
    ['Goods', usd(goods)],
    ['Shipping', usd(d.shippingCents)],
    ['Total', usd(goods + d.shippingCents)],
  ];
  totals.forEach(([k, v], i) => {
    doc.setFont('helvetica', i === 2 ? 'bold' : 'normal');
    doc.setFontSize(i === 2 ? 12 : 10);
    ink();
    doc.text(k, W - 200, fy + i * 16);
    doc.text(v, W - 40, fy + i * 16, { align: 'right' });
  });
  fy += 64;

  // Payment instructions and agreement terms.
  const block = (title: string, lines: string[]) => {
    if (lines.length === 0) return;
    if (fy > H - 120) {
      doc.addPage();
      fy = 50;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    muted();
    doc.text(title, 40, fy);
    doc.setFont('helvetica', 'normal');
    ink();
    const wrapped = lines.flatMap((l) => doc.splitTextToSize(l, W - 80) as string[]);
    doc.text(wrapped, 40, fy + 13);
    fy += 13 + wrapped.length * 11 + 10;
  };
  block('PAYMENT — ACH / WIRE', [
    company.bank_name ? `Bank: ${company.bank_name}` : '',
    company.bank_account_name ? `Account name: ${company.bank_account_name}` : '',
    company.routing_number ? `Routing (ABA): ${company.routing_number}` : '',
    company.account_number ? `Account: ${company.account_number}` : '',
    company.swift ? `SWIFT: ${company.swift}` : '',
    company.bank_address ? `Bank address: ${company.bank_address}` : '',
    `Reference: ${d.number}`,
    company.payment_notes ?? '',
  ].filter(Boolean));
  block('TRANSFER DATE', company.transfer_date_rule ? [company.transfer_date_rule] : []);
  block('DISCREPANCY THRESHOLD', company.discrepancy_threshold ? [company.discrepancy_threshold] : []);

  doc.setFontSize(8);
  muted();
  doc.text(d.isTest ? 'TEST DATA — rehearsal order · not a real Sales Order' : company.sales_order_footer || 'Thank you for your business.', 40, H - 30);
  doc.save(`${d.number}.pdf`);
}

/**
 * QuickBooks Online invoice import (Sales → Import invoices): one row per
 * line, shipping as its own "Shipping" line. Generic column set until OMP's
 * QuickBooks template arrives.
 */
export function salesOrdersQuickBooksCsv(docs: (SalesOrderDoc & { customer: string })[]): string {
  const rows: (string | number)[][] = [
    ['InvoiceNo', 'Customer', 'InvoiceDate', 'DueDate', 'Terms', 'Memo', 'Item(Product/Service)', 'ItemDescription', 'ItemQuantity', 'ItemRate', 'ItemAmount'],
  ];
  const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '');
  for (const d of docs) {
    const base = [d.number, d.customer, day(d.invoiceDate ?? d.orderDate), day(d.dueDate), d.terms ? TERMS_LABEL[d.terms] : '', d.note ?? ''];
    for (const l of d.lines) rows.push([...base, l.sku, l.description, l.qty, (l.unitCents / 100).toFixed(2), ((l.qty * l.unitCents) / 100).toFixed(2)]);
    if (d.shippingCents > 0) rows.push([...base, 'Shipping', 'Shipping', 1, (d.shippingCents / 100).toFixed(2), (d.shippingCents / 100).toFixed(2)]);
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\n');
}

type AnyOrderLine = { sku: string; qtyRequested: number; qtyApproved: number | null; unitPriceCents: number };

/** Billed quantity per line: approved units once the order is approved, requested before. */
export function billedLines<L extends AnyOrderLine>(status: string, lines: L[], describe: (l: L) => string): SalesOrderLine[] {
  const approved = ['approved', 'partially_approved', 'shipped'].includes(status);
  return lines
    .map((l) => ({ sku: l.sku, description: describe(l), qty: approved ? (l.qtyApproved ?? 0) : l.qtyRequested, unitCents: l.unitPriceCents }))
    .filter((l) => l.qty > 0);
}

export function addressLines(a: { street?: string; city?: string; state?: string; zip?: string } | null): string[] {
  if (!a?.street) return [];
  return [a.street, [a.city, a.state, a.zip].filter(Boolean).join(', ')].filter(Boolean) as string[];
}
