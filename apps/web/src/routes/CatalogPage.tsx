import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { SlidersHorizontal, X, SearchX } from 'lucide-react';
import { CATALOG, CATEGORIES, unitPriceCents, type CatalogItem } from '@/data/catalog';
import { useTier } from '@/store';
import { CatalogFilters, PRICE_BANDS } from '@/components/store/CatalogFilters';
import { ProductGrid } from '@/components/store/ProductGrid';
import { Button } from '@/components/ui/Button';

const SORTS = [
  { id: 'featured', label: 'Featured' },
  { id: 'price-asc', label: 'Price: low to high' },
  { id: 'price-desc', label: 'Price: high to low' },
  { id: 'rating', label: 'Top rated' },
];

export default function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const { tier } = useTier();
  const [mobileOpen, setMobileOpen] = useState(false);

  const q = (params.get('q') ?? '').toLowerCase();
  const brand = params.get('brand');
  const category = params.get('category');
  const condition = params.get('condition');
  const price = params.get('price');
  const sort = params.get('sort') ?? 'featured';

  const items = useMemo(() => {
    const list = CATALOG.filter((i) => {
      // Search by brand, model, and color name (Agreement §1.5: "search by brand, model, color…").
      if (q && !`${i.brand} ${i.model} ${i.colors.map((c) => c.name).join(' ')}`.toLowerCase().includes(q)) return false;
      if (brand && i.brand !== brand) return false;
      if (category && i.category !== category) return false;
      if (condition && i.condition !== condition) return false;
      if (price) {
        const band = PRICE_BANDS.find((p) => p.id === price);
        if (band && !band.test(i.msrpCents)) return false;
      }
      return true;
    });
    const byPrice = (i: CatalogItem) => unitPriceCents(i, tier.code);
    if (sort === 'price-asc') return [...list].sort((a, b) => byPrice(a) - byPrice(b));
    if (sort === 'price-desc') return [...list].sort((a, b) => byPrice(b) - byPrice(a));
    if (sort === 'rating') return [...list].sort((a, b) => b.rating - a.rating);
    return list;
  }, [q, brand, category, condition, price, sort, tier.code]);

  const title = q
    ? `Results for “${params.get('q')}”`
    : condition === 'cpo'
      ? 'Certified Pre-Owned'
      : brand
        ? brand === 'Apple'
          ? 'iPhone'
          : 'Samsung Galaxy'
        : category
          ? (CATEGORIES.find((c) => c.id === category)?.label ?? 'Phones')
          : 'All phones';

  function setSort(value: string) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('sort', value);
        return next;
      },
      { replace: true },
    );
  }

  return (
    <div className="container py-8 md:py-12">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-mono">{items.length}</span> {items.length === 1 ? 'phone' : 'phones'} · live tier
            pricing &amp; inventory
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setMobileOpen(true)}>
            <SlidersHorizontal className="h-4 w-4" strokeWidth={2} />
            Filters
          </Button>
          <label className="relative">
            <span className="sr-only">Sort by</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="h-9 cursor-pointer appearance-none rounded-full border border-border bg-background pl-4 pr-9 text-sm outline-none transition-colors hover:bg-muted focus:border-brand"
            >
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <svg className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </label>
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[244px_1fr] lg:gap-8">
        <aside className="hidden lg:block">
          <div className="sticky top-28">
            <CatalogFilters />
          </div>
        </aside>

        <div>
          {items.length > 0 ? (
            <ProductGrid items={items} />
          ) : (
            <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border py-20 text-center">
              <div className="grid h-16 w-16 place-items-center rounded-2xl bg-muted">
                <SearchX className="h-7 w-7 text-muted-foreground" strokeWidth={1.5} />
              </div>
              <div>
                <p className="font-medium">No phones match these filters</p>
                <p className="mt-1 text-sm text-muted-foreground">Try clearing a filter or broadening your search.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setParams({}, { replace: true })}>
                Clear filters
              </Button>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div className="fixed inset-0 z-50 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <button className="absolute inset-0 cursor-default bg-foreground/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)} aria-label="Close filters" />
            <motion.div
              className="absolute left-0 top-0 h-full w-[84%] max-w-xs overflow-y-auto bg-background p-5 shadow-2xl"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 260, damping: 30 }}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="font-display font-semibold">Filters</span>
                <button onClick={() => setMobileOpen(false)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-muted" aria-label="Close">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <CatalogFilters hideTitle />
              <Button className="mt-4 w-full" onClick={() => setMobileOpen(false)}>
                Show {items.length} results
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
