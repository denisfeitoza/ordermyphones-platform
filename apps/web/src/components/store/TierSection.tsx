import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { CATALOG } from '@/data/catalog';
import { TIERS, resolveTierByUnits } from '@/data/tiers';
import { TierLadder } from './TierLadder';
import { buttonVariants } from '@/components/ui/Button';
import { tierBg, tierText } from '@/lib/tierStyles';
import { cn } from '@/lib/utils';

const PRESETS = [1, 12, 60, 420];
const example = CATALOG.find((i) => i.id === 'iphone-16-pro') ?? CATALOG[0];

export function TierSection() {
  const [qty, setQty] = useState(60);
  const reached = resolveTierByUnits(qty);

  return (
    <section id="tiers" className="scroll-mt-24 border-y border-border bg-muted/30">
      <div className="container grid items-center gap-10 py-16 md:py-24 lg:grid-cols-2 lg:gap-16">
        <div>
          <span className="text-xs font-semibold uppercase tracking-widest text-brand">For business</span>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight md:text-4xl text-balance">
            Priced for how you actually buy
          </h2>
          <p className="mt-3 max-w-md text-muted-foreground">
            Your tier moves up automatically as cumulative volume grows — and a single large cart can lift it for that
            order. No quotes, no waiting on a rep.
          </p>

          <ul className="mt-6 grid gap-2 sm:grid-cols-2">
            {TIERS.map((t) => (
              <li
                key={t.code}
                className={cn(
                  'rounded-xl border bg-card p-3 transition-colors',
                  t.code === reached.code ? 'border-foreground' : 'border-border',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className={cn('h-2 w-2 rounded-full', tierBg[t.tone])} />
                  <span className="text-sm font-medium">{t.label}</span>
                </div>
                <p className="mt-1 font-mono text-xs text-muted-foreground">{t.rangeLabel}</p>
                <p className={cn('mt-0.5 text-xs font-semibold', tierText[t.tone])}>
                  {t.discount > 0 ? `−${Math.round(t.discount * 100)}% off retail` : 'Retail'}
                </p>
              </li>
            ))}
          </ul>

          <Link to="/contact" className={cn(buttonVariants({ size: 'lg' }), 'mt-7')}>
            Apply for tier pricing
            <ArrowRight className="h-4 w-4" strokeWidth={2} />
          </Link>
        </div>

        <div className="rounded-3xl border border-border bg-card p-5 shadow-card">
          <div className="mb-4 flex items-center gap-3">
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-muted/50">
              <img src={example.image} alt={example.model} className="h-full w-full object-contain p-1.5" />
            </div>
            <div>
              <p className="font-medium">{example.model}</p>
              <p className="text-xs text-muted-foreground">
                Buying <span className="font-mono font-semibold text-foreground">{qty}</span> →{' '}
                <span className={cn('font-medium', tierText[reached.tone])}>{reached.label}</span>
              </p>
            </div>
          </div>

          <div className="mb-4 grid grid-cols-4 gap-2">
            {PRESETS.map((n) => (
              <button
                key={n}
                onClick={() => setQty(n)}
                className={cn(
                  'rounded-lg border py-2 font-mono text-sm transition-colors',
                  qty === n ? 'border-foreground bg-foreground text-background' : 'border-border hover:bg-muted',
                )}
              >
                {n}
              </button>
            ))}
          </div>

          <TierLadder item={example} qty={qty} />
        </div>
      </div>
    </section>
  );
}
