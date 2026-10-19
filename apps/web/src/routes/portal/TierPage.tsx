import { Link } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';
import { useTier } from '@/store';
import { useEffectiveTier } from '@/lib/effectiveTier';
import { PageHeading } from '@/components/portal/parts';
import { TierBadge } from '@/components/store/TierBadge';
import { buttonVariants } from '@/components/ui/Button';
import { tierBg, tierText } from '@/lib/tierStyles';
import { cn } from '@/lib/utils';
import { useAuth } from '@/store';
import { useI18n } from '@/i18n';
import { formatInt } from '@/lib/format';
import { DB_TIER_LABELS } from '@/lib/invites';
import { nextBand, useMyTierProgress } from '@/data/tierProgress';

export default function TierPage() {
  // Real mode: the tier comes from the profile (useEffectiveTier); the mock
  // store is only the demo fallback (audit 2026-09-13).
  const mock = useTier();
  const { tierDef } = useEffectiveTier();
  const tier = tierDef ?? mock.tier;
  const { t } = useI18n();
  const { signedIn } = useAuth();
  const progress = useMyTierProgress(signedIn);
  const next = progress.data ? nextBand(progress.data) : null;
  const pct = progress.data && next ? Math.min(100, Math.round((progress.data.units / next.at) * 100)) : 100;

  const benefits = [
    tier.discount > 0 ? `${Math.round(tier.discount * 100)}% off retail on every device` : 'Retail pricing on every device',
    'Live stock confirmed and reserved at source before any charge',
    'Per-shipment tracking from your portal',
    'Priority fulfillment on bulk orders',
  ];

  return (
    <div className="space-y-6">
      <PageHeading title="Your tier" subtitle="The pricing your account receives — applied automatically on every order." />

      <section className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center justify-between gap-3">
          <TierBadge tier={tier} />
          <span className={cn('font-mono text-2xl font-semibold tabular-nums', tierText[tier.tone])}>
            {tier.discount > 0 ? `−${Math.round(tier.discount * 100)}%` : 'Retail'}
          </span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">No codes, no quotes — your price is applied at checkout.</p>

        <ul className="mt-5 space-y-2.5">
          {benefits.map((b) => (
            <li key={b} className="flex items-start gap-2.5 text-sm">
              <span className={cn('mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-white', tierBg[tier.tone])}>
                <Check className="h-3 w-3" strokeWidth={3} />
              </span>
              {b}
            </li>
          ))}
        </ul>
      </section>

      {progress.data && (
        <section className="space-y-3 rounded-2xl border border-border bg-card p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-medium">{t('Your volume')}</h2>
            <span className="font-mono text-sm tabular-nums">
              {formatInt(progress.data.units)} {t('units bought')}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-sm text-muted-foreground">
            {next
              ? progress.data.units >= next.at
                ? `${t('Your volume reaches')} ${t(DB_TIER_LABELS[next.tier])}. ${t('Our team reviews tier upgrades — no action needed.')}`
                : `${formatInt(next.at - progress.data.units)} ${t('more units to reach')} ${t(DB_TIER_LABELS[next.tier])}.`
              : t('You are on the top tier.')}
          </p>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-muted/30 p-5">
        <p className="flex-1 text-sm text-muted-foreground">
          Buying at higher volume? Your account manager can review your pricing.
        </p>
        <Link to="/contact" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
          Contact sales
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
        </Link>
      </div>
    </div>
  );
}
