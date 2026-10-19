import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigationType, useSearchParams } from 'react-router-dom';
import type { VirtualItem } from '@tanstack/react-virtual';
import { Search, SlidersHorizontal, X, LayoutGrid, Rows3, ClipboardList } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useRealCatalog } from '@/data/realCatalog';
import { RealModelGrid } from './RealModelGrid';
import { RealCatalogTable } from './RealCatalogTable';
import { RealCatalogEmpty } from './RealCatalogEmpty';
import { RealCatalogFilters, facetValueLabel, CATEGORY_LABEL } from './RealCatalogFilters';
import { QuickOrderDialog } from './QuickOrderDialog';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { useI18n } from '@/i18n';

type CatalogView = 'grid' | 'table';
const VIEW_KEY = 'omp_catalog_view';

function readView(): CatalogView {
  if (typeof window === 'undefined') return 'grid';
  try {
    return window.localStorage.getItem(VIEW_KEY) === 'table' ? 'table' : 'grid';
  } catch {
    return 'grid'; // storage blocked (private mode, policy)
  }
}
import {
  computeFacetedCatalog,
  emptyFacetState,
  anyFacetActive,
  FACET_KEYS,
  type FacetKey,
  type FacetState,
  type Sort,
} from '@/lib/realCatalogFacets';
import { groupByModel, listingsByGroup, sortGroups } from '@/lib/modelGroups';

const SORTS = [
  { id: 'featured', label: 'Featured' },
  { id: 'best-selling', label: 'Best selling' },
  { id: 'newest', label: 'New arrivals' },
  { id: 'price-asc', label: 'Price: low to high' },
  { id: 'price-desc', label: 'Price: high to low' },
] as const;

/**
 * How many model cards the grid paints per page. The *full* filtered+sorted
 * set still powers search/sort/facets and the total-count label; Load more
 * appends another WINDOW. The table does not page: it is virtualized
 * (RealCatalogTable), so it lists every SKU at the DOM cost of a screenful.
 */
const WINDOW = 48;

/**
 * What a buyer had on screen when they left the catalog (to a model or product
 * page), keyed by the history entry. Back (a POP to the same entry) restores
 * the filters, the grid page count and the scroll position. In memory only:
 * a reload starts fresh, like any other page.
 */
interface CatalogSnapshot {
  q: string;
  sort: Sort;
  facets: FacetState;
  view: CatalogView;
  visibleCount: number;
  scrollY: number;
  tableMeasurements: VirtualItem[] | undefined;
}
const snapshots = new Map<string, CatalogSnapshot>();
const MAX_SNAPSHOTS = 20;

function saveSnapshot(key: string, snap: CatalogSnapshot) {
  snapshots.delete(key);
  snapshots.set(key, snap);
  if (snapshots.size > MAX_SNAPSHOTS) snapshots.delete(snapshots.keys().next().value as string);
}

/**
 * Real-mode catalog page (M2-P1). Facet filters (make, condition, storage,
 * carrier, lock, location, price) with live add-this-value counts, computed
 * client-side over the fetched set via computeFacetedCatalog — no extra
 * network, exact counts, and the WINDOW render cap is preserved. Desktop shows
 * a sticky sidebar; mobile opens the same panel in a slide-over. All facet
 * values are customer-safe (see the masking note in realCatalogFacets.ts).
 */
export function RealCatalogView() {
  const { t } = useI18n();
  const real = useRealCatalog();
  const location = useLocation();
  const navigationType = useNavigationType();
  // Copied once at mount: the live snapshot below is a new object, so scroll
  // events before the restore cannot overwrite the position we restore to.
  const [restored] = useState<CatalogSnapshot | undefined>(() =>
    navigationType === 'POP' ? snapshots.get(location.key) : undefined,
  );
  const [q, setQ] = useState(restored?.q ?? '');
  const [sort, setSort] = useState<Sort>(restored?.sort ?? 'featured');
  const [facets, setFacets] = useState<FacetState>(restored?.facets ?? emptyFacetState);
  // Bounded render window. Reset to the first page whenever search, sort, or a
  // facet changes (in the handlers below, not a useEffect) so the slice never
  // renders a stale over-large page for a frame.
  const [visibleCount, setVisibleCount] = useState(restored?.visibleCount ?? WINDOW);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [view, setView] = useState<CatalogView>(restored?.view ?? readView);
  const [params] = useSearchParams();
  // A restored visit already holds the filters the URL params produced (plus
  // what the buyer picked after), so the params sync below skips its mount run.
  const skipParamsSync = useRef(restored !== undefined);
  const tableMeasurements = useRef<(() => VirtualItem[]) | null>(null);

  // Sync the header's category nav (?brand=Apple, ?condition=cpo, ?q=…) into the
  // facet state. The mock catalog reads these params directly; the real view
  // uses local facet state, so without this the "iPhone / Samsung / Certified
  // Pre-Owned" links navigate but never filter. Runs only when the params
  // change (i.e. a nav click / deep link), so user-picked facets are preserved.
  useEffect(() => {
    if (skipParamsSync.current) {
      skipParamsSync.current = false;
      return;
    }
    const brand = params.get('brand');
    const condition = params.get('condition');
    const category = params.get('category');
    const urlQ = params.get('q');
    if (brand === null && condition === null && category === null && urlQ === null) return;
    const next = emptyFacetState();
    if (brand) next.make.add(brand);
    if (category && category in CATEGORY_LABEL) next.category.add(category);
    if (condition === 'cpo') {
      next.grade.add('Certified Pre-Owned');
      next.grade.add('Certified Pre-Owned · Grade A');
    }
    setFacets(next);
    setQ(urlQ ?? '');
    setVisibleCount(WINDOW);
  }, [params]);

  // Keep this history entry's snapshot current. The scroll position is saved
  // from the scroll listener, not on unmount: by then the page has already
  // shrunk and the browser has clamped scrollY. That clamp also fires a scroll
  // event before this effect is cleaned up, so ignore scrolls once the
  // catalog is out of the document.
  const rootRef = useRef<HTMLDivElement>(null);
  const live = useRef<CatalogSnapshot>({ q, sort, facets, view, visibleCount, scrollY: 0, tableMeasurements: undefined });
  Object.assign(live.current, { q, sort, facets, view, visibleCount });
  useEffect(() => {
    const snap = live.current;
    const key = location.key;
    const measurements = tableMeasurements; // the table re-points .current; read it at leave time
    const onScroll = () => {
      if (rootRef.current?.isConnected) snap.scrollY = window.scrollY;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      snap.tableMeasurements = snap.view === 'table' ? measurements.current?.() : undefined;
      saveSnapshot(key, snap);
    };
  }, [location.key]);

  // Back: return to where the buyer was once the rows exist. ScrollToHash
  // jumps to the top on every route change, so retry after it, as it does.
  const pendingScroll = useRef(restored?.scrollY);
  useEffect(() => {
    const top = pendingScroll.current;
    if (top === undefined || real.isLoading) return;
    pendingScroll.current = undefined;
    const jump = () => window.scroll({ top, left: 0, behavior: 'instant' as ScrollBehavior });
    const timers = [0, 60, 250].map((ms) => window.setTimeout(jump, ms));
    return () => timers.forEach(clearTimeout);
  }, [real.isLoading]);

  function selectView(next: CatalogView) {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* storage blocked — the choice just isn't remembered */
    }
  }

  // Typing stays instant: the filter runs on a deferred copy of the query.
  const deferredQ = useDeferredValue(q);
  const { filtered, counts } = useMemo(
    () => computeFacetedCatalog(real.items, facets, deferredQ, sort),
    [real.items, facets, deferredQ, sort],
  );

  // Grid browses by model (one card per model, options picked on /m/:slug);
  // the table stays one row per SKU for wholesale buyers who order by line.
  const groups = useMemo(() => sortGroups(groupByModel(filtered), sort), [filtered, sort]);
  const tableItems = useMemo(() => (sort === 'featured' ? listingsByGroup(groups) : filtered), [sort, groups, filtered]);
  const total = view === 'grid' ? groups.length : filtered.length;

  // Single-valued filters travel to the model page so it opens preselected.
  const modelSearch = useMemo(() => {
    const qs = new URLSearchParams();
    for (const [facet, param] of [['capacity', 'capacity'], ['grade', 'condition'], ['lock', 'lock'], ['carrier', 'carrier']] as const) {
      if (facets[facet].size === 1) qs.set(param, [...facets[facet]][0]);
    }
    const str = qs.toString();
    return str ? `?${str}` : '';
  }, [facets]);

  const resetWindow = () => setVisibleCount(WINDOW);

  // Heading follows the category: one picked → its name; a catalog that only
  // carries phones → "All phones"; otherwise accessories ride along → "All products".
  const pickedCategory = facets.category.size === 1 ? [...facets.category][0] : null;
  const onlyPhones = real.items.every((i) => i.category === 'phones');
  const heading = pickedCategory ? (CATEGORY_LABEL[pickedCategory] ?? pickedCategory) : onlyPhones ? 'All phones' : 'All products';
  // The SKU counter follows the heading: "phones" only when only phones are listed.
  const phonesOnly = pickedCategory ? pickedCategory === 'phones' : onlyPhones;
  const unit = phonesOnly ? ['phone', 'phones'] : ['product', 'products'];

  function toggleFacet(key: FacetKey, value: string) {
    setFacets((prev) => {
      const nextSet = new Set(prev[key]);
      if (nextSet.has(value)) nextSet.delete(value);
      else nextSet.add(value);
      return { ...prev, [key]: nextSet };
    });
    resetWindow();
  }

  function clearAll() {
    setFacets(emptyFacetState());
    resetWindow();
  }

  const activeFilters = FACET_KEYS.flatMap((key) => [...facets[key]].map((value) => ({ key, value })));
  const hasActiveFilters = anyFacetActive(facets);

  // The grid mounts only this slice; `filtered` (the full set) still drives
  // facets, sort and the total-count label.
  const visibleGroups = groups.slice(0, visibleCount);
  const hasMore = view === 'grid' && visibleCount < groups.length;

  return (
    <div ref={rootRef} className="container py-8 md:py-12">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">{t(heading)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {view === 'grid' ? (
              <>
                <span className="font-mono">{groups.length}</span> {groups.length === 1 ? t('model') : t('models')} ·{' '}
                <span className="font-mono">{filtered.length}</span> {filtered.length === 1 ? t('option') : t('options')}
              </>
            ) : (
              <>
                <span className="font-mono">{filtered.length}</span> {t(filtered.length === 1 ? unit[0] : unit[1])}
              </>
            )}{' '}
            · {t('live tier pricing & inventory')}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setMobileOpen(true)}>
            <SlidersHorizontal className="h-4 w-4" strokeWidth={2} />
            {t('Filters')}
            {hasActiveFilters && (
              <span className="ml-1 grid h-5 min-w-[20px] place-items-center rounded-full bg-brand px-1 font-mono text-[0.65rem] font-semibold text-white">
                {activeFilters.length}
              </span>
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setQuickOpen(true)} title={t('Quick order')}>
            <ClipboardList className="h-4 w-4" strokeWidth={2} />
            <span className="hidden sm:inline">{t('Quick order')}</span>
          </Button>
          <label className="relative order-first basis-full sm:order-none sm:basis-auto">
            <span className="sr-only">{t('Search products')}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={2} />
            <input
              type="text"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                resetWindow();
              }}
              placeholder={t('Search iPhone, Galaxy, SKU…')}
              className="h-11 w-full rounded-full border border-border bg-background pl-9 pr-3 text-base outline-none transition-colors focus:border-brand sm:h-9 sm:w-64 sm:text-sm"
            />
          </label>
          <div className="ml-auto inline-flex items-center rounded-full border border-border p-0.5 sm:ml-0" role="group" aria-label={t('View')}>
            <button
              type="button"
              onClick={() => selectView('grid')}
              className={cn('grid h-10 w-10 place-items-center rounded-full transition-colors sm:h-8 sm:w-8', view === 'grid' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground')}
              aria-label={t('Grid view')}
              aria-pressed={view === 'grid'}
            >
              <LayoutGrid className="h-4 w-4" strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={() => selectView('table')}
              className={cn('grid h-10 w-10 place-items-center rounded-full transition-colors sm:h-8 sm:w-8', view === 'table' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground')}
              aria-label={t('Table view')}
              aria-pressed={view === 'table'}
            >
              <Rows3 className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
          <label className="relative">
            <span className="sr-only">{t('Sort by')}</span>
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as Sort);
                resetWindow();
              }}
              className="h-9 cursor-pointer appearance-none rounded-full border border-border bg-background pl-4 pr-9 text-sm outline-none transition-colors hover:bg-muted focus:border-brand"
            >
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {t(s.label)}
                </option>
              ))}
            </select>
            <svg className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </label>
        </div>
      </div>

      {real.pricesError && (
        <div role="alert" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <span>{t('Could not load your prices. Products are still listed, but you cannot add them to the cart until prices load.')}</span>
          <Button variant="outline" size="sm" onClick={real.retryPrices}>
            {t('Try again')}
          </Button>
        </div>
      )}

      {real.isError && (
        <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {t('Could not load the live catalog. Please try again shortly.')}
        </div>
      )}

      <div className="lg:grid lg:grid-cols-[244px_1fr] lg:gap-8">
        <aside className="hidden lg:block">
          <div className="sticky top-28 max-h-[calc(100dvh-8rem)] overflow-y-auto pr-1">
            <RealCatalogFilters
              counts={counts}
              facets={facets}
              onToggle={toggleFacet}
              onClearAll={clearAll}
              signedIn={real.signedIn}
            />
          </div>
        </aside>

        <div>
          {hasActiveFilters && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {activeFilters.map(({ key, value }) => (
                <button
                  key={`${key}:${value}`}
                  type="button"
                  onClick={() => toggleFacet(key, value)}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border bg-secondary px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                >
                  {t(facetValueLabel(key, value))}
                  <X className="h-3 w-3 text-muted-foreground" strokeWidth={2.5} />
                </button>
              ))}
              <button onClick={clearAll} className="px-1 text-xs font-medium text-brand hover:underline">
                {t('Clear all')}
              </button>
            </div>
          )}

          {real.isLoading ? (
            <div className="rounded-2xl border border-border bg-card p-16 text-center text-sm text-muted-foreground">
              {t('Loading catalog…')}
            </div>
          ) : filtered.length > 0 ? (
            <>
              {view === 'table' ? (
                <RealCatalogTable items={tableItems} initialMeasurements={restored?.tableMeasurements} measurementsRef={tableMeasurements} />
              ) : (
                <RealModelGrid groups={visibleGroups} search={modelSearch} />
              )}
              {hasMore && (
                <div className="mt-8 flex flex-col items-center gap-3">
                  <p className="text-sm text-muted-foreground">
                    {t('Showing')} <span className="font-mono">{visibleGroups.length}</span> {t('of')}{' '}
                    <span className="font-mono">{groups.length}</span>
                  </p>
                  <Button variant="outline" className="min-h-11 w-full sm:w-auto sm:min-w-48" onClick={() => setVisibleCount((c) => c + WINDOW)}>
                    {t('Load more')}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <RealCatalogEmpty
              title={q || hasActiveFilters ? t('No phones match these filters') : undefined}
              subtitle={q || hasActiveFilters ? t('Try clearing a filter or broadening your search.') : undefined}
              onClear={hasActiveFilters ? clearAll : undefined}
            />
          )}
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div className="fixed inset-0 z-50 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <button className="absolute inset-0 cursor-default bg-foreground/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)} aria-label={t('Close filters')} />
            <motion.div
              className="absolute left-0 top-0 flex h-full w-[86%] max-w-xs flex-col bg-background shadow-2xl"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 260, damping: 30 }}
            >
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <span className="font-display font-semibold">{t('Filters')}</span>
                <div className="flex items-center gap-3">
                  {hasActiveFilters && (
                    <button onClick={clearAll} className="text-xs font-medium text-brand hover:underline">
                      {t('Clear all')}
                    </button>
                  )}
                  <button onClick={() => setMobileOpen(false)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-muted" aria-label={t('Close')}>
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4">
                <RealCatalogFilters
                  counts={counts}
                  facets={facets}
                  onToggle={toggleFacet}
                  onClearAll={clearAll}
                  signedIn={real.signedIn}
                  hideTitle
                />
              </div>
              <div className="border-t border-border p-4">
                <Button className="w-full" onClick={() => setMobileOpen(false)}>
                  {t('Show')} {total} {t('results')}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <QuickOrderDialog open={quickOpen} onClose={() => setQuickOpen(false)} />
    </div>
  );
}
