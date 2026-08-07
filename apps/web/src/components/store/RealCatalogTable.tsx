import { Link } from 'react-router-dom';
import { buildDisplayName, carrierLabel, type PricedRealListing } from '@/data/realCatalog';
import { Badge } from '@/components/ui/Badge';
import { formatInt } from '@/lib/format';
import { useAuth } from '@/store/auth';
import { useI18n } from '@/i18n';
import { RealPriceTag } from './RealPriceTag';
import { RealAddToCart, canOrder } from './RealAddToCart';
import { gradeTone } from './RealProductCard';

/**
 * Dense table/list view for the real catalog (M2-P2) — the order-building
 * multiplier: a buyer entering dozens of SKUs scans aligned rows and types
 * quantity inline, instead of scrolling one card at a time. Same
 * filtered+sorted+windowed set as the card grid; reuses the card's atoms
 * (grade tone, price tag, order gate) so the two views never disagree.
 *
 * Responsive: a real aligned grid on md+ (with a sticky-feel header), and a
 * compact stacked row on mobile so it stays usable at 320px (no horizontal
 * scroll, touch targets ≥ 32px).
 */

// Product column takes the leftover (minmax(0,1fr) so it truncates instead of
// pushing the fixed columns off-grid). Carrier/lock isn't its own column — the
// product name already ends in "· Unlocked" / "· AT&T Locked", so a separate
// column would be redundant and starve Product of width.
const GRID = 'grid-cols-[minmax(0,1fr)_120px_72px_104px_148px]';

function lockLabel(i: PricedRealListing): string {
  return i.lockStatus === 'unlocked' ? 'Unlocked' : `${carrierLabel(i.carrier)} Locked`;
}

function Row({ item }: { item: PricedRealListing }) {
  const { t } = useI18n();
  const { signedIn, role } = useAuth();
  const soldOut = item.totalQty === 0;
  const orderable = !soldOut && canOrder(signedIn, role, item.priceCents);
  const name = buildDisplayName(item);

  return (
    <>
      {/* Desktop row */}
      <div className={`hidden md:grid ${GRID} items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-muted/40`}>
        <div className="min-w-0">
          <Link to={`/p/${item.sku}`} className="block truncate font-medium tracking-tight hover:text-brand">
            {name}
          </Link>
          <p className="truncate text-xs text-muted-foreground">
            {item.color ? `${item.color} · ` : ''}
            <span className="font-mono">{item.sku}</span>
          </p>
        </div>
        <div className="min-w-0">
          <Badge tone={gradeTone(item.ctiaGrade)}>{t(item.ctiaLabel)}</Badge>
        </div>
        <div className="text-right font-mono tabular-nums">
          {soldOut ? <span className="text-muted-foreground">—</span> : formatInt(item.totalQty)}
        </div>
        <div className="text-right">
          <RealPriceTag priceCents={item.priceCents} size="sm" />
        </div>
        <div className="flex justify-end">
          {orderable ? (
            <RealAddToCart variantId={item.variantId} priceCents={item.priceCents} layout="row" />
          ) : (
            <Link to={`/p/${item.sku}`} className="text-sm font-medium text-brand hover:underline">
              {soldOut ? t('Restocking soon') : t('View details')}
            </Link>
          )}
        </div>
      </div>

      {/* Mobile row */}
      <div className="flex items-start gap-3 px-3 py-3 md:hidden">
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <Link to={`/p/${item.sku}`} className="font-medium leading-tight tracking-tight hover:text-brand">
              {name}
            </Link>
            <Badge tone={gradeTone(item.ctiaGrade)}>{t(item.ctiaLabel)}</Badge>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {item.color ? `${item.color} · ` : ''}
            {lockLabel(item)} · <span className="font-mono">{item.sku}</span>
          </p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {soldOut ? (
                t('Restocking soon')
              ) : (
                <>
                  <span className="font-mono font-semibold tabular-nums text-foreground">{formatInt(item.totalQty)}</span> {t('in stock')}
                </>
              )}
              {' · '}
              <RealPriceTag priceCents={item.priceCents} size="sm" className="align-baseline" />
            </span>
            {orderable ? (
              <RealAddToCart variantId={item.variantId} priceCents={item.priceCents} layout="row" />
            ) : (
              !soldOut && (
                <Link to={`/p/${item.sku}`} className="shrink-0 text-sm font-medium text-brand hover:underline">
                  {t('View')}
                </Link>
              )
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export function RealCatalogTable({ items }: { items: PricedRealListing[] }) {
  const { t } = useI18n();
  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      <div className={`hidden md:grid ${GRID} gap-3 border-b border-border bg-muted/40 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground`}>
        <span>{t('Product')}</span>
        <span>{t('Condition')}</span>
        <span className="text-right">{t('Stock')}</span>
        <span className="text-right">{t('Price')}</span>
        <span className="text-right">{t('Order')}</span>
      </div>
      <div className="divide-y divide-border">
        {items.map((item) => (
          <Row key={item.variantId} item={item} />
        ))}
      </div>
    </div>
  );
}
