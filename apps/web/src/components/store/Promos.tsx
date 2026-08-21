import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useHomeContent } from '@/data/homeContent';
import { useI18n } from '@/i18n';

const reveal = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
};

/** Featured promotions ("Save up to $500"). Admin-configurable
 *  (home_content.promos) — add/remove cards in the Home & promos tab. */
export function Promos() {
  const { t } = useI18n();
  const { data } = useHomeContent();
  const p = data?.promos;
  if (!p?.enabled || p.cards.length === 0) return null;

  return (
    <section className="container py-10 md:py-14">
      <h2 className="mb-6 font-display text-2xl font-semibold tracking-tight md:text-3xl">{t(p.title)}</h2>
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-60px' }}
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07 } } }}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {p.cards.map((card) => (
          <motion.div key={card.id} variants={reveal}>
            <Link
              to={card.href}
              className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-soft transition-colors hover:border-brand/40"
            >
              <span className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-brand-gradient opacity-10 blur-xl transition-opacity group-hover:opacity-20" />
              {card.badge && (
                <span className="inline-flex w-fit rounded-full bg-brand/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-brand">
                  {t(card.badge)}
                </span>
              )}
              <h3 className="mt-3 font-display text-xl font-semibold tracking-tight text-balance">{t(card.title)}</h3>
              {card.subtitle && <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground text-pretty">{t(card.subtitle)}</p>}
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-foreground group-hover:gap-2">
                {t('Shop now')}
                <ArrowRight className="h-4 w-4" strokeWidth={2} />
              </span>
            </Link>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
