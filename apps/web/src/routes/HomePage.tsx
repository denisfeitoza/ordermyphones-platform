import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Hero } from '@/components/store/Hero';
import { ProductGrid } from '@/components/store/ProductGrid';
import { Testimonials } from '@/components/store/Testimonials';
import { Recommendations } from '@/components/store/Recommendations';
import { CATALOG } from '@/data/catalog';

export default function HomePage() {
  const featured = CATALOG.slice(0, 6);

  return (
    <div>
      <Hero />

      <section className="container py-16 md:py-20">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">Featured phones</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Best sellers across iPhone and Galaxy, priced for your tier.
            </p>
          </div>
          <Link
            to="/catalog"
            className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-brand hover:gap-2.5"
          >
            View all
            <ArrowRight className="h-4 w-4" strokeWidth={2} />
          </Link>
        </div>
        <ProductGrid items={featured} />
      </section>

      <Testimonials />

      <Recommendations />
    </div>
  );
}
