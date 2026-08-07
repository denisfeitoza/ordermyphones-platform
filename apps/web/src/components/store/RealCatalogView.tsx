import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useRealCatalog, buildDisplayName, type PricedRealListing } from '@/data/realCatalog';
import { RealProductGrid } from './RealProductGrid';
import { RealCatalogEmpty } from './RealCatalogEmpty';
import { useI18n } from '@/i18n';

const SORTS = [
  { id: 'featured', label: 'Featured' },
  { id: 'price-asc', label: 'Price: low to high' },
  { id: 'price-desc', label: 'Price: high to low' },
] as const;

/**
 * Real-mode catalog page. Deliberately simpler than the mock's
 * <CatalogPage> chrome (no brand/category/price-band sidebar): the real
 * feed's filter axes are grade/carrier/location, not the mock's curated
 * category taxonomy, and Phase 4's scope is display + export, not a new
 * filter model for graded wholesale stock. Search + sort cover the same
 * "find a phone" job at variant granularity.
 */
export function RealCatalogView() {
  const { t } = useI18n();
  const real = useRealCatalog();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<(typeof SORTS)[number]['id']>('featured');

  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list: PricedRealListing[] = real.items;
    if (needle) {
      list = list.filter((i) => {
        const haystack = `${buildDisplayName(i)} ${i.sku} ${i.color ?? ''}`.toLowerCase();
        return haystack.includes(needle);
      });
    }
    if (sort === 'price-asc' || sort === 'price-desc') {
      const sign = sort === 'price-asc' ? 1 : -1;
      list = [...list].sort((a, b) => sign * ((a.priceCents ?? Number.MAX_SAFE_INTEGER) - (b.priceCents ?? Number.MAX_SAFE_INTEGER)));
    }
    return list;
  }, [real.items, q, sort]);

  return (
    <div className="container py-8 md:py-12">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">{t('All phones')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-mono">{items.length}</span> {items.length === 1 ? t('phone') : t('phones')} · {t('live tier pricing & inventory')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="relative">
            <span className="sr-only">{t('Search products')}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={2} />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('Search iPhone, Galaxy, SKU…')}
              className="h-9 w-48 rounded-full border border-border bg-background pl-9 pr-3 text-sm outline-none transition-colors focus:border-brand sm:w-64"
            />
          </label>
          <label className="relative">
            <span className="sr-only">{t('Sort by')}</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as (typeof SORTS)[number]['id'])}
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
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {t('Could not load the live catalog. Please try again shortly.')}
        </div>
      )}

      {real.isLoading ? (
        <div className="rounded-2xl border border-border bg-card p-16 text-center text-sm text-muted-foreground">
          {t('Loading catalog…')}
        </div>
      ) : items.length > 0 ? (
        <RealProductGrid items={items} />
      ) : (
        <RealCatalogEmpty
          title={q ? t('No phones match this search') : undefined}
          subtitle={q ? t('Try a different model, color or SKU.') : undefined}
        />
      )}
    </div>
  );
}
