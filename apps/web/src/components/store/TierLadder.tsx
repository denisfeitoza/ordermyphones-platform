import { unitPriceCents, type CatalogItem } from '@/data/catalog';
import { TIERS, resolveTierByUnits } from '@/data/tiers';
import { tierBg, tierBorder, tierText } from '@/lib/tierStyles';
import { formatUsd } from '@/lib/format';
import { cn } from '@/lib/utils';

/** The 4-tier price ladder for one product, highlighting the tier the quantity reaches. */
export function TierLadder({ item, qty, className }: { item: CatalogItem; qty: number; className?: string }) {
  const reached = resolveTierByUnits(Math.max(1, qty));
  const retail = unitPriceCents(item, 'tier_1');

  return (
    <div className={cn('space-y-1.5', className)}>
      {TIERS.map((t) => {
        const price = unitPriceCents(item, t.code);
        const save = retail - price;
        const active = t.code === reached.code;
        return (
          <div
            key={t.code}
            className={cn(
              'flex items-center justify-between rounded-xl border px-3 py-2.5 transition-colors',
              active ? cn('bg-muted/60', tierBorder[t.tone]) : 'border-border',
            )}
          >
            <div className="flex items-center gap-2.5">
              <span className={cn('h-2 w-2 shrink-0 rounded-full', tierBg[t.tone])} />
              <div>
                <p className="flex items-center gap-2 text-sm font-medium">
                  {t.label}
                  {active && (
                    <span className={cn('rounded-full px-1.5 py-0.5 text-[0.65rem] font-semibold', tierText[t.tone])}>
                      your price
                    </span>
                  )}
                </p>
                <p className="font-mono text-xs text-muted-foreground">{t.rangeLabel}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-mono text-sm font-semibold tabular-nums">{formatUsd(price)}</p>
              {save > 0 && <p className={cn('font-mono text-xs', tierText[t.tone])}>−{formatUsd(save)}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
