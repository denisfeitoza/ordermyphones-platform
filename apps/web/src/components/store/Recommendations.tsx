import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { CATALOG } from '@/data/catalog';
import { ProductCard } from './ProductCard';
import { cn } from '@/lib/utils';

export function Recommendations() {
  const ref = useRef<HTMLDivElement>(null);
  const items = [...CATALOG].sort((a, b) => b.rating - a.rating).slice(0, 8);

  function scroll(dir: number) {
    ref.current?.scrollBy({ left: dir * 320, behavior: 'smooth' });
  }

  return (
    <section className="container py-16 md:py-20">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h2 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">Explore our recommendations</h2>
        <div className="flex gap-2">
          {[-1, 1].map((dir) => (
            <button
              key={dir}
              onClick={() => scroll(dir)}
              className="grid h-10 w-10 place-items-center rounded-full border border-border transition-colors hover:bg-muted"
              aria-label={dir < 0 ? 'Previous' : 'Next'}
            >
              {dir < 0 ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
            </button>
          ))}
        </div>
      </div>

      <div ref={ref} className={cn('scrollbar-hide -mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-2', 'mask-fade-x')}>
        {items.map((item) => (
          <div key={item.id} className="w-[270px] shrink-0 snap-start">
            <ProductCard item={item} />
          </div>
        ))}
      </div>
    </section>
  );
}
