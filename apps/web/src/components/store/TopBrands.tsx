import { motion } from 'framer-motion';
import { LogoMark } from './Logo';
import { useI18n } from '@/i18n';

// Wordmark tiles (not embedded logo art) — clean and consistent with the
// storefront's minimal type system, and free of external logo assets. Swap any
// entry for an inline SVG mark later if the client supplies brand artwork.
const BRANDS = ['Apple', 'Samsung', 'Nokia', 'LG', 'Motorola', 'TCL', 'Infinix', 'Google'] as const;

const reveal = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
};

/** "Top Brands" — landing section (menu: Top Brands). A tile grid of the
 *  manufacturers we carry, in the storefront's monochrome type treatment. */
export function TopBrands() {
  const { t } = useI18n();
  return (
    <section id="brands" className="scroll-mt-24">
      <div className="container py-16 md:py-24">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
          variants={reveal}
          className="max-w-2xl"
        >
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-brand">
            <LogoMark className="h-4 w-4" />
            {t('Top Brands')}
          </span>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-balance md:text-4xl">
            {t('The brands you order most')}
          </h2>
          <p className="mt-3 text-muted-foreground text-pretty">
            {t('A curated lineup of leading manufacturers — premium new and certified pre-owned devices, ready to ship across every tier.')}
          </p>
        </motion.div>

        <motion.ul
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
          className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4"
        >
          {BRANDS.map((brand) => (
            <motion.li
              key={brand}
              variants={reveal}
              className="group grid h-24 place-items-center rounded-2xl border border-border bg-card shadow-soft transition-colors hover:border-brand/40"
            >
              <span className="font-display text-xl font-semibold tracking-tight text-muted-foreground transition-colors group-hover:text-foreground md:text-2xl">
                {brand}
              </span>
            </motion.li>
          ))}
        </motion.ul>
      </div>
    </section>
  );
}
