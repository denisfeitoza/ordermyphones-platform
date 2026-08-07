import type { RealCartLine } from '@/store/realCart';

export interface PlaceOrderItem {
  variant_id: string;
  location_id?: string;
  qty: number;
}

/**
 * Expand cart lines into place_order's p_items (M2-P3). A line with a
 * per-location split becomes one item per (variant, location); a line with no
 * split becomes a single system-decide item (no location_id). Pure, so the
 * expansion is unit-tested directly. place_order re-validates server-side and,
 * when order_location_selection is OFF, ignores any location_id — so this is
 * v1-safe even if a stale split survives a flag flip.
 */
export function expandCartToOrderItems(lines: RealCartLine[]): PlaceOrderItem[] {
  return lines.flatMap((l) =>
    l.allocations && l.allocations.length
      ? l.allocations.map((a) => ({ variant_id: l.variantId, location_id: a.locationId, qty: a.qty }))
      : [{ variant_id: l.variantId, qty: l.qty }],
  );
}
