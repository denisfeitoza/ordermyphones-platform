import { type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { buttonVariants } from '@/components/ui/Button';
import { useSync } from '@/store';
import { formatInt } from '@/lib/format';
import { cn } from '@/lib/utils';
import { PulseDot } from './SyncHeartbeat';

export function Hero() {
  const reduce = useReducedMotion();
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 60, damping: 18 });
  const sy = useSpring(my, { stiffness: 60, damping: 18 });
  const tx = useTransform(sx, [-0.5, 0.5], reduce ? [0, 0] : [-22, 22]);
  const ty = useTransform(sy, [-0.5, 0.5], reduce ? [0, 0] : [-14, 14]);
  const { suppliers, skusTracked } = useSync();

  function onMove(e: MouseEvent<HTMLElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
  }

  const stats = [
    { value: '4', label: 'Pricing tiers' },
    { value: String(suppliers.length), label: 'Live suppliers' },
    { value: formatInt(skusTracked), label: 'SKUs tracked' },
    { value: '< 2s', label: 'Stock refresh' },
  ];

  return (
    <section
      onMouseMove={onMove}
      className="relative isolate overflow-hidden bg-foreground text-background"
    >
      <motion.img
        src="/generated/hero-phones.png"
        alt=""
        aria-hidden
        style={{ x: tx, y: ty }}
        className="absolute inset-0 h-full w-full scale-[1.12] object-cover object-right"
      />
      <div className="absolute inset-0 bg-hero-fade" />
      <div className="absolute inset-0 bg-grid-faint opacity-50" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-foreground to-transparent" />

      <div className="relative container flex min-h-[82vh] flex-col justify-center py-20 md:py-24">
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } } }}
          className="max-w-2xl"
        >
          <motion.div
            variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium ring-1 ring-white/15 backdrop-blur"
          >
            <PulseDot />
            Live wholesale &amp; retail inventory
          </motion.div>

          <motion.h1
            variants={{ hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="mt-6 font-display text-[2.7rem] font-semibold leading-[0.98] tracking-tightest text-balance sm:text-6xl md:text-[4.5rem]"
          >
            Phones, priced for <span className="text-gradient-brand">your tier</span>.
          </motion.h1>

          <motion.p
            variants={{ hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="mt-5 max-w-lg text-base text-background/70 text-pretty md:text-lg"
          >
            From a single iPhone to a 500-unit Galaxy pallet — we aggregate real-time supplier stock
            and apply the right tier price automatically. No spreadsheets, no back-and-forth.
          </motion.p>

          <motion.div
            variants={{ hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="mt-8 flex flex-wrap gap-3"
          >
            <Link to="/catalog" className={buttonVariants({ size: 'lg', variant: 'brand' })}>
              Shop the catalog
              <ArrowRight className="h-4 w-4" strokeWidth={2} />
            </Link>
            <Link
              to="/contact"
              className={cn(
                buttonVariants({ size: 'lg', variant: 'outline' }),
                'border-white/25 bg-transparent text-background hover:bg-white/10',
              )}
            >
              Become a reseller
            </Link>
          </motion.div>

          <motion.dl
            variants={{ hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="mt-12 grid max-w-lg grid-cols-2 gap-x-6 gap-y-5 border-t border-white/10 pt-7 sm:grid-cols-4"
          >
            {stats.map((s) => (
              <div key={s.label}>
                <dt className="font-mono text-2xl font-semibold tabular-nums">{s.value}</dt>
                <dd className="mt-1 text-xs text-background/55">{s.label}</dd>
              </div>
            ))}
          </motion.dl>
        </motion.div>
      </div>
    </section>
  );
}
