import { Link } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';
import { useTier } from '@/store';
import { PageHeading } from '@/components/portal/parts';
import { TierBadge } from '@/components/store/TierBadge';
import { buttonVariants } from '@/components/ui/Button';
import { tierBg, tierText } from '@/lib/tierStyles';
import { cn } from '@/lib/utils';

export default function TierPage() {
  const { tier } = useTier();

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
