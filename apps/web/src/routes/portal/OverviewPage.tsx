import { Link } from 'react-router-dom';
import { ArrowRight, TrendingUp } from 'lucide-react';
import { useAccount } from '@/store';
import { TierBadge } from '@/components/store/TierBadge';
import { OrderCard } from '@/components/portal/OrderCard';
import { PageHeading, Stat } from '@/components/portal/parts';
import { tierBg } from '@/lib/tierStyles';
import { formatInt, formatUsd } from '@/lib/format';
import { cn } from '@/lib/utils';

export default function OverviewPage() {
  const { businessName, orders, lifetimeUnits, lifetimeSpentCents, accountTier, toNext } = useAccount();

  const lifetimeSavings = orders.reduce((s, o) => s + o.savingsCents, 0);
  const activeOrders = orders.filter((o) => o.status !== 'delivered').length;
  const recent = orders.slice(0, 2);

  // Fraction of the way from this tier's floor to the next tier's floor.
  const progress = toNext
    ? Math.min(1, Math.max(0, (lifetimeUnits - accountTier.minUnits) / (toNext.next.minUnits - accountTier.minUnits)))
    : 1;

  return (
    <div className="space-y-6">
      <PageHeading title={`Welcome back, ${businessName}`} subtitle="Your account, orders, and tier — all in one place." />

      {/* Tier status — the one elevated surface; everything keys off the real account tier. */}
      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="text-sm text-muted-foreground">Account tier</span>
            <TierBadge tier={accountTier} showRange />
          </div>
          <Link to="/portal/tier" className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
            Tier details
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
          </Link>
        </div>

        <div className="px-5 py-5">
          {toNext ? (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 font-medium">
                  <TrendingUp className="h-4 w-4 text-brand" strokeWidth={2} />
                  {formatInt(toNext.remaining)} more units to {toNext.next.label}
                </span>
                <span className="font-mono text-muted-foreground">
                  {formatInt(lifetimeUnits)} / {formatInt(toNext.next.minUnits)}
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn('h-full rounded-full transition-[width] duration-700', tierBg[accountTier.tone])}
                  style={{ width: `${Math.max(4, progress * 100)}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Tiers climb automatically with cumulative volume — {toNext.next.label} unlocks{' '}
                {Math.round(toNext.next.discount * 100)}% off retail.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              You&apos;re at the top tier — Wholesale pricing is applied to every order.
            </p>
          )}
        </div>
      </section>

      {/* Lifetime stats — bordered cells, no nested boxes. */}
      <div className="grid grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-2xl border border-border sm:grid-cols-4 sm:divide-y-0">
        <Stat label="Lifetime units" value={formatInt(lifetimeUnits)} />
        <Stat label="Lifetime spend" value={formatUsd(lifetimeSpentCents, true)} />
        <Stat label="Tier savings" value={formatUsd(lifetimeSavings, true)} accent="text-success" />
        <Stat label="Active orders" value={String(activeOrders)} sub="in fulfillment" />
      </div>

      {/* Recent orders */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Recent orders</h2>
          <Link to="/portal/orders" className="text-sm text-muted-foreground hover:text-foreground">
            View all ({orders.length})
          </Link>
        </div>
        <div className="grid gap-3">
          {recent.map((o, i) => (
            <OrderCard key={o.id} order={o} index={i} />
          ))}
        </div>
      </section>
    </div>
  );
}
