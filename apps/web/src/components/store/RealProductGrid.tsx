import { motion, type Variants } from 'framer-motion';
import type { PricedRealListing } from '@/data/realCatalog';
import { RealProductCard } from './RealProductCard';
import { cn } from '@/lib/utils';

// Small per-card stagger: with the real catalog's bounded 48-card window a
// 0.05s step would take ~2.4s to settle (and was ~130s across the full 2,675
// rows before windowing). 0.015s keeps the entrance lively without a long
// orchestration tail on large pages; the ≤12-item consumers barely notice.
const container: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.015 } } };
const card: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
};

export function RealProductGrid({ items, className }: { items: PricedRealListing[]; className?: string }) {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3', className)}
    >
      {items.map((it) => (
        <motion.div key={it.variantId} variants={card}>
          <RealProductCard item={it} />
        </motion.div>
      ))}
    </motion.div>
  );
}
