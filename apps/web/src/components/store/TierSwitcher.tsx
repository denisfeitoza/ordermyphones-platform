import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { TIERS } from '@/data/tiers';
import { useTier } from '@/store';
import { tierBg } from '@/lib/tierStyles';
import { cn } from '@/lib/utils';

/** Preview pricing for any tier. In production the tier follows cumulative volume. */
export function TierSwitcher({ className }: { className?: string }) {
  const { tier, setTier } = useTier();
  const [open, setOpen] = useState(false);

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-background px-3 text-xs font-medium transition-colors hover:bg-muted"
      >
        <span className={cn('h-1.5 w-1.5 rounded-full', tierBg[tier.tone])} />
        <span className="hidden text-muted-foreground sm:inline">View as</span>
        <span>{tier.label}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} strokeWidth={2} />
      </button>

      {open && (
        <>
          <button className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} aria-label="Close" />
          <div className="absolute right-0 z-50 mt-2 w-72 origin-top-right animate-scale-in rounded-2xl border border-border bg-card p-1.5 shadow-card-hover">
            <p className="px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              Your tier follows cumulative purchase volume. Preview pricing for any tier:
            </p>
            {TIERS.map((t) => (
              <button
                key={t.code}
                type="button"
                onClick={() => {
                  setTier(t.code);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors hover:bg-muted',
                  t.code === tier.code && 'bg-muted',
                )}
              >
                <span className="flex items-center gap-2">
                  <span className={cn('h-2 w-2 rounded-full', tierBg[t.tone])} />
                  {t.label}
                </span>
                <span className="font-mono text-xs text-muted-foreground">{t.rangeLabel}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
