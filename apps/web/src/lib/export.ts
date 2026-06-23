/**
 * Order / wishlist export to PDF and CSV (sheets). Pages map their own data into
 * an ExportDoc; jsPDF is lazy-loaded so it only ships when someone exports.
 */
export interface ExportLine {
  model: string;
  variant: string;
  qty: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

export interface ExportDoc {
  title: string;
  reference: string;
  business: string;
  tierLabel: string;
  dateLabel: string;
  lines: ExportLine[];
  subtotalCents: number;
  savingsCents: number;
}

const BRAND: [number, number, number] = [196, 42, 237]; // logo magenta · #C42AED
const usd = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function downloadBlob(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** CSV / spreadsheet export. */
export function exportDocCsv(d: ExportDoc) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const rows: (string | number)[][] = [
    ['Reference', d.reference],
    ['Business', d.business],
    ['Pricing tier', d.tierLabel],
    ['Date', d.dateLabel],
    [],
    ['Model', 'Variant', 'Qty', 'Unit (USD)', 'Total (USD)'],
    ...d.lines.map((l) => [l.model, l.variant, l.qty, (l.unitPriceCents / 100).toFixed(2), (l.lineTotalCents / 100).toFixed(2)]),
    [],
    ['', '', '', 'Subtotal', (d.subtotalCents / 100).toFixed(2)],
    ['', '', '', 'Tier savings vs retail', (d.savingsCents / 100).toFixed(2)],
  ];
  const csv = rows.map((r) => r.map(esc).join(',')).join('\n');
  downloadBlob(`${d.reference}.csv`, csv, 'text/csv;charset=utf-8');
}

/** PDF export (jsPDF lazy-loaded). */
export async function exportDocPdf(d: ExportDoc) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  doc.setFillColor(BRAND[0], BRAND[1], BRAND[2]);
  doc.rect(0, 0, W, 6, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(20, 20, 28);
  doc.text('OrderMyPhones', 40, 52);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(120, 120, 130);
  doc.text(d.title, 40, 70);

  doc.setFontSize(10);
  doc.setTextColor(20, 20, 28);
  doc.text(`Ref ${d.reference}`, W - 40, 52, { align: 'right' });
  doc.setTextColor(120, 120, 130);
  doc.text(d.dateLabel, W - 40, 67, { align: 'right' });

  doc.setTextColor(20, 20, 28);
  doc.setFontSize(11);
  doc.text(d.business, 40, 102);
  doc.setTextColor(120, 120, 130);
  doc.setFontSize(10);
  doc.text(`Pricing tier: ${d.tierLabel}`, 40, 118);

  autoTable(doc, {
    startY: 140,
    head: [['Model', 'Variant', 'Qty', 'Unit', 'Total']],
    body: d.lines.map((l) => [l.model, l.variant, String(l.qty), usd(l.unitPriceCents), usd(l.lineTotalCents)]),
    headStyles: { fillColor: [20, 20, 28], textColor: 255, fontStyle: 'bold' },
    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    styles: { fontSize: 10, cellPadding: 6 },
    theme: 'striped',
  });

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  let y = finalY + 26;
  const unitCount = d.lines.reduce((s, l) => s + l.qty, 0);

  doc.setFontSize(10);
  doc.setTextColor(120, 120, 130);
  doc.text(`${unitCount} units · ${d.lines.length} line${d.lines.length === 1 ? '' : 's'}`, 40, y);
  if (d.savingsCents > 0) {
    doc.setTextColor(22, 160, 110);
    doc.text(`Tier savings vs retail: -${usd(d.savingsCents)}`, W - 40, y, { align: 'right' });
    y += 18;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(20, 20, 28);
  doc.text(`Total  ${usd(d.subtotalCents)}`, W - 40, y + 6, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 160);
  doc.text('Mockup demo · stock reserved at source at order time · not a tax invoice', 40, H - 30);

  doc.save(`${d.reference}.pdf`);
}
