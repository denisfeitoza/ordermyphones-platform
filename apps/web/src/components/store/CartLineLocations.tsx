import { useState } from 'react';
import { MapPin, Wand2 } from 'lucide-react';
import type { PricedRealListing } from '@/data/realCatalog';
import type { RealCartAllocation } from '@/store/realCart';
import { formatInt } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useI18n } from '@/i18n';

/**
 * Per-location panel for one cart line (M2-P3).
 *  - Always shows the exact per-location availability (D2: the customer sees
 *    where stock is), reading the {id, name, qty} breakdown from the catalog.
 *  - When `enabled` (order_location_selection ON) and the variant is stocked at
 *    more than one location, adds an all-or-nothing allocation editor: the
 *    customer distributes the line's qty across locations. The running total
 *    must equal the line qty; partial allocations are surfaced (and block
 *    checkout upstream) rather than silently sent. `onChange(undefined)` clears
 *    the split back to system-decide.
 */
export function allocationSum(a: RealCartAllocation[] | undefined): number {
  return (a ?? []).reduce((s, x) => s + x.qty, 0);
}

/** A line is checkout-valid iff it has no split, or the split sums exactly to qty. */
export function allocationValid(line: { qty: number; allocations?: RealCartAllocation[] | undefined }): boolean {
  if (!line.allocations || line.allocations.length === 0) return true;
  return allocationSum(line.allocations) === line.qty;
}

export function CartLineLocations({
  item,
  qty,
  allocations,
  enabled,
  onChange,
}: {
  item: PricedRealListing;
  qty: number;
  allocations: RealCartAllocation[] | undefined;
  enabled: boolean;
  onChange: (allocations: RealCartAllocation[] | undefined) => void;
}) {
  const { t } = useI18n();
  const locations = item.locations;
  const multi = locations.length > 1;
  const [openEditor, setOpenEditor] = useState<boolean>(!!allocations);

  if (locations.length === 0) return null;

  const current = new Map((allocations ?? []).map((a) => [a.locationId, a.qty]));
  const sum = allocationSum(allocations);
  const valid = sum === qty;

  function setLoc(locationId: string, next: number) {
    const map = new Map(current);
    const clamped = Math.max(0, Math.floor(Number.isFinite(next) ? next : 0));
    if (clamped <= 0) map.delete(locationId);
    else map.set(locationId, clamped);
    const arr = [...map.entries()].map(([locationId, q]) => ({ locationId, qty: q }));
    onChange(arr.length ? arr : undefined);
  }

  // Greedy auto-distribute: fill the fullest locations until qty is met.
  function autoFill() {
    let remaining = qty;
    const arr: RealCartAllocation[] = [];
    for (const loc of [...locations].sort((a, b) => b.qty - a.qty)) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, loc.qty);
      if (take > 0) {
        arr.push({ locationId: loc.id, qty: take });
        remaining -= take;
      }
    }
    onChange(arr.length ? arr : undefined);
  }

  return (
    <div className="mt-2 text-xs">
      {/* Availability (always shown) */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground">
        <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
        {locations.map((loc, i) => (
          <span key={loc.id}>
            {loc.name} <span className="font-mono tabular-nums text-foreground">{formatInt(loc.qty)}</span>
            {i < locations.length - 1 && <span className="text-muted-foreground/50"> · </span>}
          </span>
        ))}
      </div>

      {enabled && multi && (
        <div className="mt-1.5">
          {!openEditor ? (
            <button type="button" onClick={() => setOpenEditor(true)} className="font-medium text-brand hover:underline">
              {t('Choose locations')}
            </button>
          ) : (
            <div className="rounded-lg border border-border p-2.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium text-foreground">{t('Source by location')}</span>
                <button type="button" onClick={autoFill} className="inline-flex items-center gap-1 text-brand hover:underline" aria-label={t('Auto-distribute')}>
                  <Wand2 className="h-3 w-3" strokeWidth={2} /> {t('Auto')}
                </button>
              </div>
              <div className="space-y-1.5">
                {locations.map((loc) => (
                  <div key={loc.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">
                      {loc.name} <span className="text-muted-foreground">({formatInt(loc.qty)})</span>
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={current.get(loc.id) ?? ''}
                      placeholder="0"
                      onChange={(e) => setLoc(loc.id, parseInt(e.target.value, 10))}
                      className="h-7 w-14 rounded-md border border-border bg-transparent px-2 text-center font-mono tabular-nums outline-none focus:border-brand [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                      aria-label={t('Quantity at') + ' ' + loc.name}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
                <span className={cn('font-medium', valid ? 'text-success' : 'text-warning')}>
                  {t('Allocated')} <span className="font-mono tabular-nums">{sum}</span> / <span className="font-mono tabular-nums">{qty}</span>
                </span>
                {(allocations?.length ?? 0) > 0 && (
                  <button type="button" onClick={() => onChange(undefined)} className="text-muted-foreground hover:text-foreground hover:underline">
                    {t('Clear')}
                  </button>
                )}
              </div>
              {!valid && (
                <p className="mt-1 text-warning">{t('Allocate exactly the line quantity across locations.')}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
