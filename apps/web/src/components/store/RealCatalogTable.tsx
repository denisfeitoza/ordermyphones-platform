import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from 'react';
import { Link } from 'react-router-dom';
import { useWindowVirtualizer, defaultRangeExtractor, type VirtualItem } from '@tanstack/react-virtual';
import { localizedDisplayName, type PricedRealListing } from '@/data/realCatalog';
import { Badge } from '@/components/ui/Badge';
import { useAuth } from '@/store/auth';
import { useI18n } from '@/i18n';
import { RealPriceTag } from './RealPriceTag';
import { RealAddToCart, canOrder } from './RealAddToCart';
import { gradeTone } from './RealProductCard';
import { useStockLabel } from '@/lib/stockDisplay';
import { useMediaQuery, MD_QUERY } from '@/lib/useMediaQuery';
import { cn } from '@/lib/utils';

/**
 * Dense table/list view for the real catalog (M2-P2) — the order-building
 * multiplier: a buyer entering dozens of SKUs scans aligned rows and types
 * quantity inline, instead of scrolling one card at a time. Same
 * filtered+sorted set as the card grid; reuses the card's atoms
 * (grade tone, price tag, order gate) so the two views never disagree.
 *
 * Responsive: a real aligned grid on md+ (with a sticky-feel header), and a
 * compact stacked row on mobile so it stays usable at 320px (no horizontal
 * scroll, touch targets ≥ 32px). Only the layout for the current breakpoint
 * is mounted (useMediaQuery), and only the rows near the viewport.
 */

// Product column takes the leftover (minmax(0,1fr) so it truncates instead of
// pushing the fixed columns off-grid). Carrier/lock isn't its own column — the
// product name already ends in "· Unlocked" / "· AT&T Locked", so a separate
// column would be redundant and starve Product of width.
const GRID = 'grid-cols-[minmax(0,1fr)_120px_72px_104px_148px]';

function Row({ item, desktop }: { item: PricedRealListing; desktop: boolean }) {
  const stock = useStockLabel();
  const { t } = useI18n();
  const { signedIn, role } = useAuth();
  const soldOut = item.totalQty === 0;
  const orderable = !soldOut && canOrder(signedIn, role, item.priceCents);
  const name = localizedDisplayName(item, t);

  if (desktop) {
    return (
      <div className={`grid ${GRID} items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-muted/40`}>
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
          {soldOut ? <span className="text-muted-foreground">—</span> : stock(item.totalQty)}
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
    );
  }

  // The name already ends in the lock/carrier ("· Unlocked"), so the
  // subtitle carries only color and SKU.
  return (
    <div className="flex items-start gap-3 px-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <Link to={`/p/${item.sku}`} className="font-medium leading-tight tracking-tight hover:text-brand">
            {name}
          </Link>
          <Badge tone={gradeTone(item.ctiaGrade)}>{t(item.ctiaLabel)}</Badge>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {item.color ? `${item.color} · ` : ''}
          <span className="font-mono">{item.sku}</span>
        </p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {soldOut ? (
              t('Restocking soon')
            ) : (
              <>
                <span className="font-mono font-semibold tabular-nums text-foreground">{stock(item.totalQty)}</span> {t('in stock')}
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
  );
}

/** Row heights before measurement; real heights come from measureElement. */
const ESTIMATE_DESKTOP = 61;
const ESTIMATE_MOBILE = 109;

export interface RealCatalogTableProps {
  items: PricedRealListing[];
  /** Measured rows from a previous visit (Back from a product page), so the
   * restored scroll offset lands on the same rows. */
  initialMeasurements?: VirtualItem[] | undefined;
  /** Receives a getter for the current measurements; the catalog calls it
   * when it leaves, to save them with the scroll position. */
  measurementsRef?: MutableRefObject<(() => VirtualItem[]) | null>;
}

/**
 * Window-scrolled virtual list: only the rows near the viewport are mounted,
 * so 10,000 variants cost the same DOM as 30. Rows are absolutely positioned
 * inside a box of the full list height; the page scrollbar stays the scroller.
 */
export function RealCatalogTable({ items, initialMeasurements, measurementsRef }: RealCatalogTableProps) {
  const { t } = useI18n();
  const desktop = useMediaQuery(MD_QUERY);
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  // Index of the row whose quantity field has focus. It and the next row
  // always stay mounted, so a buyer who scrolls away mid-typing keeps the typed
  // quantity, and Enter still moves to the next row (the next field in DOM order).
  const focusedIndex = useRef<number | null>(null);

  // The list starts below the page header, filter chips and banners; the
  // virtualizer needs that document offset. Re-read after every render and
  // on resize (wrapping toolbar), and only set state when it moved.
  useLayoutEffect(() => {
    const read = () => {
      const el = listRef.current;
      if (!el) return;
      const top = Math.round(el.getBoundingClientRect().top + window.scrollY);
      setScrollMargin((prev) => (prev === top ? prev : top));
    };
    read();
    window.addEventListener('resize', read);
    return () => window.removeEventListener('resize', read);
  });

  const virtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize: () => (desktop ? ESTIMATE_DESKTOP : ESTIMATE_MOBILE),
    getItemKey: (index) => items[index]?.variantId ?? index,
    overscan: 8,
    scrollMargin,
    initialMeasurementsCache: initialMeasurements ?? [],
    rangeExtractor: (range) => {
      const indexes = defaultRangeExtractor(range);
      const f = focusedIndex.current;
      if (f === null) return indexes;
      const keep = [f, f + 1].filter((i) => i < range.count && !indexes.includes(i));
      return keep.length ? [...indexes, ...keep].sort((a, b) => a - b) : indexes;
    },
  });

  if (measurementsRef) measurementsRef.current = () => virtualizer.takeSnapshot();

  // Mobile and desktop rows differ in height; drop the old sizes on a flip.
  useEffect(() => {
    virtualizer.measure();
  }, [desktop, virtualizer]);

  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      {desktop && (
        <div className={`grid ${GRID} gap-3 border-b border-border bg-muted/40 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground`}>
          <span>{t('Product')}</span>
          <span>{t('Condition')}</span>
          <span className="text-right">{t('Stock')}</span>
          <span className="text-right">{t('Price')}</span>
          <span className="text-right">{t('Order')}</span>
        </div>
      )}
      <div
        ref={listRef}
        className="relative"
        style={{ height: virtualizer.getTotalSize() }}
        onFocus={(e) => {
          const row = (e.target as HTMLElement).closest<HTMLElement>('[data-index]');
          focusedIndex.current = row ? Number(row.dataset.index) : null;
        }}
        onBlur={() => {
          focusedIndex.current = null;
        }}
      >
        {virtualizer.getVirtualItems().map((v) => (
          <div
            key={v.key}
            data-index={v.index}
            ref={virtualizer.measureElement}
            className={cn('absolute left-0 top-0 w-full', v.index < items.length - 1 && 'border-b border-border')}
            style={{ transform: `translateY(${v.start - scrollMargin}px)` }}
          >
            <Row item={items[v.index]} desktop={desktop} />
          </div>
        ))}
      </div>
    </div>
  );
}
