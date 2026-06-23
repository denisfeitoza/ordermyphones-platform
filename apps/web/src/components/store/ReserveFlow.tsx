import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Simulates the reserve-at-source flow: confirm live stock, cross-check open
 * orders, hold the units, then authorize. UI-only — the real adapters do this
 * server-side against the supplier network (sources never exposed to the buyer).
 */
export function ReserveFlow({ units, onComplete }: { units: number; onComplete: () => void }) {
  const u = `${units} ${units === 1 ? 'unit' : 'units'}`;
  const steps = [
    'Querying live stock at source',
    'Confirming availability across the network',
    `Cross-checking ${u} against open orders`,
    `Reserving ${u} at source`,
    'Authorizing payment',
    'Confirming order',
  ];
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (active >= steps.length) {
      const t = setTimeout(onComplete, 550);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setActive((a) => a + 1), active === 0 ? 600 : 820);
    return () => clearTimeout(t);
    // advancing on `active`; steps.length is constant, onComplete fires once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <div className="space-y-1">
      {steps.map((label, i) => {
        const done = i < active;
        const loading = i === active;
        return (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: i > active ? 0.4 : 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5"
          >
            <span
              className={cn(
                'grid h-6 w-6 shrink-0 place-items-center rounded-full',
                done ? 'bg-success text-white' : loading ? 'bg-brand/10 text-brand' : 'bg-muted text-muted-foreground',
              )}
            >
              {done ? (
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
              ) : loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
              )}
            </span>
            <span className={cn('text-sm', loading && 'font-medium', i > active && 'text-muted-foreground')}>
              {label}
            </span>
            {loading && <span className="ml-auto font-mono text-xs text-brand">live</span>}
            {done && <span className="ml-auto font-mono text-xs text-success">ok</span>}
          </motion.div>
        );
      })}
    </div>
  );
}
