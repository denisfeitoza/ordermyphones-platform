import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, X, LayoutGrid, Rows3, ClipboardList } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useRealCatalog } from '@/data/realCatalog';
import { RealProductGrid } from './RealProductGrid';
import { RealCatalogTable } from './RealCatalogTable';
import { RealCatalogEmpty } from './RealCatalogEmpty';
import { RealCatalogFilters, facetValueLabel } from './RealCatalogFilters';
import { QuickOrderDialog } from './QuickOrderDialog';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { useI18n } from '@/i18n';

type CatalogView = 'grid' | 'table';
const VIEW_KEY = 'omp_catalog_view';

function readView(): CatalogView {
  if (typeof window === 'undefined') return 'grid';
  return window.localStorage.getItem(VIEW_KEY) === 'table' ? 'table' : 'grid';
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

const SORTS = [
  { id: 'featured', label: 'Featured' },
  { id: 'best-selling', label: 'Best selling' },
  { id: 'newest', label: 'New arrivals' },
  { id: 'price-asc', label: 'Price: low to high' },
  { id: 'price-desc', label: 'Price: high to low' },
] as const;

/**
 * How many cards to paint into the DOM per page in real mode. The real HYLA
 * catalog is ~2,675 variants; the *full* filtered+sorted set still powers
 * search/sort/facets and the total-count label, but only this many cards are
 * mounted at once. Load-more appends another WINDOW. Keeps the mock path
 * untouched — that page never mounts this component.
 */
const WINDOW = 48;

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
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('featured');
  const [facets, setFacets] = useState<FacetState>(emptyFacetState);
  // Bounded render window. Reset to the first page whenever search, sort, or a
  // facet changes (in the handlers below, not a useEffect) so the slice never
  // renders a stale over-large page for a frame.
  const [visibleCount, setVisibleCount] = useState(WINDOW);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [view, setView] = useState<CatalogView>(readView);
  const [params] = useSearchParams();

  // Sync the header's category nav (?brand=Apple, ?condition=cpo, ?q=…) into the
  // facet state. The mock catalog reads these params directly; the real view
  // uses local facet state, so without this the "iPhone / Samsung / Certified
  // Pre-Owned" links navigate but never filter. Runs only when the params
  // change (i.e. a nav click / deep link), so user-picked facets are preserved.
  useEffect(() => {
    const brand = params.get('brand');
    const condition = params.get('condition');
    const urlQ = params.get('q');
    if (brand === null && condition === null && urlQ === null) return;
    const next = emptyFacetState();
    if (brand) next.make.add(brand);
    if (condition === 'cpo') {
      next.grade.add('Certified Pre-Owned');
      next.grade.add('Certified Pre-Owned · Grade A');
    }
    setFacets(next);
    setQ(urlQ ?? '');
    setVisibleCount(WINDOW);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  function selectView(next: CatalogView) {
    setView(next);
    if (typeof window !== 'undefined') window.localStorage.setItem(VIEW_KEY, next);
  }

  const { filtered, counts } = useMemo(
    () => computeFacetedCatalog(real.items, facets, q, sort),
    [real.items, facets, q, sort],
  );

  const resetWindow = () => setVisibleCount(WINDOW);

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

  // Only this slice is mounted into the DOM; `filtered` (the full set) still
  // drives facets, sort and the total-count label.
  const visibleItems = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  return (
    <div className="container py-8 md:py-12">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">{t('All phones')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-mono">{filtered.length}</span> {filtered.length === 1 ? t('phone') : t('phones')} · {t('live tier pricing & inventory')}
          </p>
        </div>
        <div className="flex items-center gap-2">
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
          <label className="relative">
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
              className="h-9 w-40 rounded-full border border-border bg-background pl-9 pr-3 text-sm outline-none transition-colors focus:border-brand sm:w-64"
            />
          </label>
          <div className="hidden items-center rounded-full border border-border p-0.5 sm:inline-flex" role="group" aria-label={t('View')}>
            <button
              type="button"
              onClick={() => selectView('grid')}
              className={cn('grid h-8 w-8 place-items-center rounded-full transition-colors', view === 'grid' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground')}
              aria-label={t('Grid view')}
              aria-pressed={view === 'grid'}
            >
              <LayoutGrid className="h-4 w-4" strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={() => selectView('table')}
              className={cn('grid h-8 w-8 place-items-center rounded-full transition-colors', view === 'table' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground')}
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
                  {facetValueLabel(key, value)}
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
              {view === 'table' ? <RealCatalogTable items={visibleItems} /> : <RealProductGrid items={visibleItems} />}
              {hasMore && (
                <div className="mt-8 flex flex-col items-center gap-3">
                  <p className="text-sm text-muted-foreground">
                    {t('Showing')} <span className="font-mono">{visibleItems.length}</span> {t('of')}{' '}
                    <span className="font-mono">{filtered.length}</span>
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
                  {t('Show')} {filtered.length} {t('results')}
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
