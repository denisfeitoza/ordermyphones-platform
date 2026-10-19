/**
 * What an order is worth right now. The stored subtotal is what the buyer
 * asked for; once staff decide, only the approved units count. One rule for
 * every screen, export and report:
 *   pending                         → requested total (orders.subtotal_cents)
 *   approved / partially / shipped  → Σ qty_approved × unit price
 *   rejected / cancelled            → 0
 */
export type OrderTotalsStatus = 'pending' | 'approved' | 'partially_approved' | 'rejected' | 'cancelled' | 'shipped';

export interface TotalsLine {
  qtyRequested: number;
  qtyApproved: number | null;
  unitPriceCents: number;
}

const DECIDED = new Set<OrderTotalsStatus>(['approved', 'partially_approved', 'shipped']);

export function approvedTotalCents(lines: readonly TotalsLine[]): number {
  return lines.reduce((s, l) => s + (l.qtyApproved ?? 0) * l.unitPriceCents, 0);
}

export function orderValueCents(status: OrderTotalsStatus, subtotalCents: number, lines: readonly TotalsLine[]): number {
  if (status === 'rejected' || status === 'cancelled') return 0;
  if (DECIDED.has(status)) return approvedTotalCents(lines);
  return subtotalCents;
}

/** True when staff approved less than was ordered (show both amounts). */
export function isShortOrder(status: OrderTotalsStatus, subtotalCents: number, lines: readonly TotalsLine[]): boolean {
  return DECIDED.has(status) && approvedTotalCents(lines) < subtotalCents;
}

/** Units that count for the same statuses (approved units once decided). */
export function orderUnits(status: OrderTotalsStatus, lines: readonly TotalsLine[]): number {
  if (status === 'rejected' || status === 'cancelled') return 0;
  return lines.reduce((s, l) => s + (DECIDED.has(status) ? (l.qtyApproved ?? 0) : l.qtyRequested), 0);
}
