import { motion } from 'framer-motion';
import { Boxes, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { LogoMark } from './Logo';
import { useI18n } from '@/i18n';

const ITEMS = [
  {
    icon: Boxes,
    title: 'Comprehensive device distribution',
    body: 'New and certified pre-owned smartphones and tablets, with consistent inventory that keeps up with diverse market demand.',
  },
  {
    icon: ShieldCheck,
    title: 'Rigorous quality assurance',
    body: 'Every device is tested and graded against strict industry standards — so reliability and customer satisfaction are the baseline, not the exception.',
  },
  {
    icon: SlidersHorizontal,
    title: 'Customized enterprise solutions',
    body: 'Tailored configurations, software integrations, and branding aligned to each enterprise’s exact requirements.',
  },
] as const;

const reveal = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
};

/** "Our Expertise" — landing section (menu: Expertise). Icon-led cards on the
 *  plain container background, matching the storefront's card + eyebrow system. */
export function Expertise() {
  const { t } = useI18n();
  return (
    <section id="expertise" className="scroll-mt-24">
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
            {t('Expertise')}
          </span>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-balance md:text-4xl">
            {t('Smart solutions, smart distribution')}
          </h2>
          <p className="mt-3 text-muted-foreground">
            {t('From single units to enterprise rollouts, we handle sourcing, grading, and fulfillment so you can move devices with confidence.')}
          </p>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
          className="mt-10 grid gap-4 md:grid-cols-3"
        >
          {ITEMS.map((item) => (
            <motion.div
              key={item.title}
              variants={reveal}
              className="flex h-full flex-col rounded-2xl border border-border bg-card p-6 shadow-soft sm:p-7"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-gradient text-white shadow-soft">
                <item.icon className="h-5 w-5" strokeWidth={2} aria-hidden />
              </span>
              <h3 className="mt-5 font-display text-lg font-semibold tracking-tight">{t(item.title)}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground text-pretty">{t(item.body)}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
