import { useMemo } from 'react';
import { TrendingUp } from 'lucide-react';
import { useHomeContent } from '@/data/homeContent';
import { useRealCatalog, type PricedRealListing } from '@/data/realCatalog';
import { useCatalogSource } from '@/lib/catalogSource';
import { RealProductGrid } from './RealProductGrid';
import { useI18n } from '@/i18n';

/** Owner-curated "trending" products. Admin picks the variants in the Home &
 *  promos tab (home_content.trending); this resolves them against the live
 *  catalog and reuses the standard product grid. Self-hides when empty. */
export function TrendingDeals() {
  const { t } = useI18n();
  const { data } = useHomeContent();
  const source = useCatalogSource();
  const { items } = useRealCatalog(source === 'real');
  const tr = data?.trending;

  const picked = useMemo<PricedRealListing[]>(() => {
    if (!tr?.enabled || !tr.variantIds.length) return [];
    const map = new Map(items.map((i) => [i.variantId, i]));
    return tr.variantIds.map((id) => map.get(id)).filter((x): x is PricedRealListing => !!x);
  }, [tr, items]);

  if (picked.length === 0) return null;

  return (
    <section className="container py-12 md:py-16">
      <div className="mb-6 flex items-center gap-2">
        <TrendingUp className="h-5 w-5 text-brand" strokeWidth={2} aria-hidden />
        <h2 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">{t(tr!.title)}</h2>
      </div>
      <RealProductGrid items={picked} />
    </section>
  );
}
