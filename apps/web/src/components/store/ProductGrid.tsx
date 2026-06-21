import { motion, type Variants } from 'framer-motion';
import type { CatalogItem } from '@/data/catalog';
import { ProductCard } from './ProductCard';
import { cn } from '@/lib/utils';

// Entry stagger on mount — content is always present (no whileInView gating),
// so products never sit invisible waiting on a scroll/IntersectionObserver tick.
const container: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
const card: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
};

export function ProductGrid({ items, className }: { items: CatalogItem[]; className?: string }) {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3', className)}
    >
      {items.map((it) => (
        <motion.div key={it.id} variants={card}>
          <ProductCard item={it} />
        </motion.div>
      ))}
    </motion.div>
  );
}
