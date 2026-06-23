import { Link } from 'react-router-dom';
import { ArrowRight, BadgePercent } from 'lucide-react';
import { useAccount, useTier } from '@/store';
import { TierBadge } from '@/components/store/TierBadge';
import { OrderCard } from '@/components/portal/OrderCard';
import { PageHeading, Stat } from '@/components/portal/parts';
import { formatInt, formatUsd } from '@/lib/format';

export default function OverviewPage() {
  const { businessName, orders, lifetimeUnits, lifetimeSpentCents } = useAccount();
  const { tier } = useTier();

  const lifetimeSavings = orders.reduce((s, o) => s + o.savingsCents, 0);
  const activeOrders = orders.filter((o) => o.status !== 'delivered').length;
  const recent = orders.slice(0, 2);

  return (
    <div className="space-y-6">
      <PageHeading title={`Welcome back, ${businessName}`} subtitle="Your account, orders, and pricing — all in one place." />

      {/* Your tier — only the customer's own tier is ever shown. */}
      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="text-sm text-muted-foreground">Your pricing tier</span>
            <TierBadge tier={tier} />
          </div>
          <Link to="/portal/tier" className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
            Tier details
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
          </Link>
        </div>
        <div className="flex items-center gap-3 px-5 py-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand/10 text-brand">
            <BadgePercent className="h-5 w-5" strokeWidth={2} />
          </span>
          <p className="text-sm text-muted-foreground">
            {tier.discount > 0 ? (
              <>
                Your account gets{' '}
                <span className="font-medium text-foreground">{Math.round(tier.discount * 100)}% off retail</span> on
                every order, applied automatically at checkout.
              </>
            ) : (
              <>Retail pricing applies. Ask your account manager about volume pricing.</>
            )}
          </p>
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
