import { motion, type Variants } from 'framer-motion';
import type { ModelGroup } from '@/lib/modelGroups';
import { RealModelCard } from './RealModelCard';
import { cn } from '@/lib/utils';

const container: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.015 } } };
const card: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
};

export function RealModelGrid({ groups, search, className }: { groups: ModelGroup[]; search?: string | undefined; className?: string }) {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3', className)}
    >
      {groups.map((g) => (
        <motion.div key={g.slug} variants={card}>
          <RealModelCard group={g} search={search} />
        </motion.div>
      ))}
    </motion.div>
  );
}
