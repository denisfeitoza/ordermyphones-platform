import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Hero } from '@/components/store/Hero';
import { ProductGrid } from '@/components/store/ProductGrid';
import { RealProductGrid } from '@/components/store/RealProductGrid';
import { RealCatalogEmpty } from '@/components/store/RealCatalogEmpty';
import { Testimonials } from '@/components/store/Testimonials';
import { Recommendations } from '@/components/store/Recommendations';
import { CATALOG } from '@/data/catalog';
import { useRealCatalog } from '@/data/realCatalog';
import { useCatalogSource } from '@/lib/catalogSource';
import { useI18n } from '@/i18n';

export default function HomePage() {
  const { t } = useI18n();
  const source = useCatalogSource();
  const featured = CATALOG.slice(0, 6);
  // Real catalog is only fetched once the flag is 'real' — mock mode never
  // pays for the network round trip, matching the "zero visual/behavioral
  // change while mock" contract.
  const real = useRealCatalog(source === 'real');

  return (
    <div>
      <Hero />

      <section className="container py-16 md:py-20">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">{t('Featured phones')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('Best sellers across iPhone and Galaxy, priced for your tier.')}
            </p>
          </div>
          <Link
            to="/catalog"
            className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-brand hover:gap-2.5"
          >
            {t('View all')}
            <ArrowRight className="h-4 w-4" strokeWidth={2} />
          </Link>
        </div>
        {source === 'mock' ? (
          <ProductGrid items={featured} />
        ) : real.items.length > 0 ? (
          <RealProductGrid items={real.items.slice(0, 6)} />
        ) : (
          <RealCatalogEmpty />
        )}
      </section>

      <Testimonials />

      <Recommendations />
    </div>
  );
}
