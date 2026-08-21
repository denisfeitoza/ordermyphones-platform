import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { BadgeCheck, LayoutGrid, type LucideIcon } from 'lucide-react';
import { BrandLogo, type BrandName } from './BrandLogos';
import { useI18n } from '@/i18n';

// Best Buy-style "Shop by category" row, right under the hero. Only destinations
// that resolve to real, in-stock filtered views (Apple/Samsung/Google are the
// makes we actually carry; CPO + all-phones round it out).
type Tile =
  | { kind: 'brand'; brand: BrandName; label: string; to: string }
  | { kind: 'icon'; icon: LucideIcon; label: string; to: string };

const TILES: Tile[] = [
  { kind: 'brand', brand: 'Apple', label: 'iPhone', to: '/catalog?brand=Apple' },
  { kind: 'brand', brand: 'Samsung', label: 'Galaxy', to: '/catalog?brand=Samsung' },
  { kind: 'brand', brand: 'Google', label: 'Pixel', to: '/catalog?brand=Google' },
  { kind: 'icon', icon: BadgeCheck, label: 'Certified Pre-Owned', to: '/catalog?condition=cpo' },
  { kind: 'icon', icon: LayoutGrid, label: 'All phones', to: '/catalog' },
];

const reveal = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
};

/** Icon/logo-led category shortcuts — the "shop without reading" entry points. */
export function ShopByCategory() {
  const { t } = useI18n();
  return (
    <section className="border-b border-border">
      <div className="container py-8 md:py-10">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-muted-foreground">{t('Shop by category')}</h2>
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-40px' }}
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
          className="scrollbar-hide -mx-1 flex gap-3 overflow-x-auto px-1 pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible md:grid-cols-5"
        >
          {TILES.map((tile) => (
            <motion.div key={tile.label} variants={reveal}>
              <Link
                to={tile.to}
                className="group flex h-28 min-w-[128px] flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 text-center shadow-soft transition-colors hover:border-brand/40 sm:min-w-0"
              >
                <span className="grid h-11 place-items-center text-muted-foreground transition-colors group-hover:text-foreground [&>span]:!text-lg [&>svg]:!h-7 [&>svg]:!w-7">
                  {tile.kind === 'brand' ? (
                    <BrandLogo brand={tile.brand} />
                  ) : (
                    <tile.icon className="h-8 w-8" strokeWidth={1.5} aria-hidden />
                  )}
                </span>
                <span className="text-sm font-medium">{t(tile.label)}</span>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
