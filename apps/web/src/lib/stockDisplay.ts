import { useQuery } from '@tanstack/react-query';
import { getAppSetting } from '@/data/adminConfig';
import { formatInt } from '@/lib/format';

export type QtyDisplay = 'exact' | 'ranges';

/** Stock as customers see it: the exact count, or a coarse range when the
 * admin turns on "ranges" (Settings → Go-live & storefront), so competitors
 * cannot read exact stock off the storefront. */
export function stockLabel(qty: number, mode: QtyDisplay): string {
  if (mode === 'exact' || qty <= 0) return formatInt(Math.max(0, qty));
  if (qty < 10) return '1–9';
  if (qty < 50) return '10+';
  if (qty < 100) return '50+';
  if (qty < 500) return '100+';
  return '500+';
}

/** Formatter bound to app_settings.catalog_qty_display (anon-readable, cached). */
export function useStockLabel(): (qty: number) => string {
  const { data } = useQuery({
    queryKey: ['app-settings', 'catalog_qty_display'],
    queryFn: () => getAppSetting<QtyDisplay>('catalog_qty_display', 'exact'),
    staleTime: 5 * 60_000,
  });
  const mode: QtyDisplay = data === 'ranges' ? 'ranges' : 'exact';
  return (qty: number) => stockLabel(qty, mode);
}
