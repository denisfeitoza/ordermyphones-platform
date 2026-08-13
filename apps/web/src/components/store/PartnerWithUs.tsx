import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight, PackageCheck, Globe2, ShieldCheck } from 'lucide-react';
import { buttonVariants } from '@/components/ui/Button';
import { LogoMark } from './Logo';
import { useI18n } from '@/i18n';

const REASONS = [
  {
    icon: PackageCheck,
    title: 'Reliable & consistent inventory',
    body: 'A steady supply of new and certified pre-owned devices, backed by a deep sourcing network — so partners always have the stock they need at competitive prices.',
  },
  {
    icon: Globe2,
    title: 'Efficient global logistics',
    body: 'A strategic supply chain and trusted shipping partners move orders securely, fast, and cost-effectively worldwide — from single units to customized bulk shipments.',
  },
  {
    icon: ShieldCheck,
    title: '90-day warranty & dedicated support',
    body: 'Every device is backed by a 90-day warranty and a responsive support team — purchases stay protected, risk-free, and personally handled.',
  },
] as const;

const reveal = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
};

/** "Partner With Us" — landing section (menu: Partner With Us). Asymmetric
 *  intro + stacked feature rows on the muted band, deliberately different from
 *  the Expertise card grid so the two sections don't read as one repeated block. */
export function PartnerWithUs() {
  const { t } = useI18n();
  return (
    <section id="partner" className="scroll-mt-24 border-y border-border bg-muted/30">
      <div className="container grid gap-10 py-16 md:py-24 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
          variants={reveal}
          className="lg:sticky lg:top-24 lg:self-start"
        >
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-brand">
            <LogoMark className="h-4 w-4" />
            {t('Partner With Us')}
          </span>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-balance md:text-4xl">
            {t('Built to keep your shelves — and your customers — supplied')}
          </h2>
          <p className="mt-3 text-muted-foreground text-pretty">
            {t('Retailers, marketplaces, and distributors partner with Order My Phones for dependable inventory, worldwide fulfillment, and support that stands behind every device.')}
          </p>
          <Link to="/request-access" className={`${buttonVariants({ size: 'lg', variant: 'brand' })} mt-7`}>
            {t('Become a partner')}
            <ArrowRight className="h-4 w-4" strokeWidth={2} />
          </Link>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.09 } } }}
          className="flex flex-col gap-4"
        >
          {REASONS.map((r) => (
            <motion.div
              key={r.title}
              variants={reveal}
              className="flex gap-4 rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-gradient text-white shadow-soft">
                <r.icon className="h-5 w-5" strokeWidth={2} aria-hidden />
              </span>
              <div>
                <h3 className="font-display text-lg font-semibold tracking-tight">{t(r.title)}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground text-pretty">{t(r.body)}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
