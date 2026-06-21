import { Link } from 'react-router-dom';
import { Check, Lock, ArrowRight } from 'lucide-react';
import { useAccount } from '@/store';
import { TIERS } from '@/data/tiers';
import { PageHeading } from '@/components/portal/parts';
import { TierBadge } from '@/components/store/TierBadge';
import { buttonVariants } from '@/components/ui/Button';
import { tierBg, tierBorder, tierText } from '@/lib/tierStyles';
import { formatInt } from '@/lib/format';
import { cn } from '@/lib/utils';

export default function TierPage() {
  const { lifetimeUnits, accountTier, toNext } = useAccount();

  return (
    <div className="space-y-6">
      <PageHeading
        title="Tier & pricing"
        subtitle="Your tier is derived from cumulative purchase volume — it never resets and only moves up."
      />

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="text-sm text-muted-foreground">Current tier</span>
            <TierBadge tier={accountTier} showRange />
          </div>
          <span className="font-mono text-sm text-muted-foreground">
            {formatInt(lifetimeUnits)} lifetime units
          </span>
        </div>
        {toNext && (
          <p className="mt-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{formatInt(toNext.remaining)} more units</span> unlocks{' '}
            {toNext.next.label} — {Math.round(toNext.next.discount * 100)}% off retail on every order.
          </p>
        )}
      </section>

      {/* Tier roadmap — vertical ladder, reached steps checked, current highlighted. */}
      <ol className="space-y-2.5">
        {TIERS.map((t) => {
          const reached = lifetimeUnits >= t.minUnits;
          const current = t.code === accountTier.code;
          return (
            <li
              key={t.code}
              className={cn(
                'flex items-center gap-4 rounded-2xl border bg-card p-4 transition-colors',
                current ? cn('bg-muted/50', tierBorder[t.tone]) : 'border-border',
              )}
            >
              <span
                className={cn(
                  'grid h-9 w-9 shrink-0 place-items-center rounded-full',
                  reached ? cn(tierBg[t.tone], 'text-white') : 'bg-muted text-muted-foreground',
                )}
              >
                {reached ? <Check className="h-4 w-4" strokeWidth={3} /> : <Lock className="h-3.5 w-3.5" strokeWidth={2} />}
              </span>

              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {t.label}
                  {current && (
                    <span className={cn('rounded-full px-2 py-0.5 text-[0.65rem] font-semibold', tierText[t.tone])}>
                      you are here
                    </span>
                  )}
                </p>
                <p className="font-mono text-xs text-muted-foreground">{t.rangeLabel}</p>
              </div>

              <span className={cn('shrink-0 font-mono text-sm font-semibold', reached ? tierText[t.tone] : 'text-muted-foreground')}>
                {t.discount > 0 ? `−${Math.round(t.discount * 100)}%` : 'Retail'}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-muted/30 p-5">
        <p className="flex-1 text-sm text-muted-foreground">
          Need volume beyond Wholesale, net terms, or a dedicated rep? Talk to the team.
        </p>
        <Link to="/contact" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
          Contact sales
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
        </Link>
      </div>
    </div>
  );
}
