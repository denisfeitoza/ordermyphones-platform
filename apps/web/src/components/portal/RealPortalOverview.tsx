import { Link } from 'react-router-dom';
import { ArrowRight, BadgePercent, ShoppingBag } from 'lucide-react';
import { useAuth } from '@/store';
import { useMyOrders, type RealOrder } from '@/data/realOrders';
import { TIERS } from '@/data/tiers';
import { TierBadge } from '@/components/store/TierBadge';
import { PageHeading, Stat } from '@/components/portal/parts';
import { formatInt, formatUsd } from '@/lib/format';

const STATUS_LABEL: Record<RealOrder['status'], string> = {
  pending: 'Pending approval',
  approved: 'Approved',
  partially_approved: 'Partially approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const unitsOf = (o: RealOrder) => o.lines.reduce((n, l) => n + l.qtyRequested, 0);

/**
 * Real-mode customer portal overview (go-live). Shows the signed-in account's
 * own real identity, tier and orders from Supabase — not the mock "Downtown
 * Mobile LLC" fixture. A fresh account legitimately shows zeros and an empty
 * order list; both fill in as the customer orders. Gated by catalog_source in
 * OverviewPage so mock mode keeps its polished demo.
 */
export function RealPortalOverview() {
  const { profile } = useAuth();
  const ordersQ = useMyOrders();
  const orders = ordersQ.data ?? [];

  const tierDef = profile?.tier ? TIERS.find((t) => t.label.toLowerCase() === profile.tier) : undefined;
  const name = profile?.display_name ?? profile?.email ?? 'there';
  const lifetimeUnits = orders.reduce((s, o) => s + unitsOf(o), 0);
  const lifetimeSpentCents = orders.reduce((s, o) => s + o.subtotalCents, 0);
  const activeOrders = orders.filter((o) => o.status === 'pending' || o.status === 'partially_approved').length;
  const recent = orders.slice(0, 3);

  return (
    <div className="space-y-6">
      <PageHeading title={`Welcome back, ${name}`} subtitle="Your account, orders, and pricing — all in one place." />

      {tierDef && (
        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div className="flex items-center gap-2.5">
              <span className="text-sm text-muted-foreground">Your pricing tier</span>
              <TierBadge tier={tierDef} />
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
              {tierDef.discount > 0 ? (
                <>
                  Your account gets{' '}
                  <span className="font-medium text-foreground">{Math.round(tierDef.discount * 100)}% off retail</span> on every order,
                  applied automatically at your tier price.
                </>
              ) : (
                <>Retail pricing applies. Ask your account manager about volume pricing.</>
              )}
            </p>
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-2xl border border-border sm:grid-cols-4 sm:divide-y-0">
        <Stat label="Lifetime units" value={formatInt(lifetimeUnits)} />
        <Stat label="Lifetime spend" value={formatUsd(lifetimeSpentCents, true)} />
        <Stat label="Orders" value={String(orders.length)} />
        <Stat label="Active orders" value={String(activeOrders)} sub="in fulfillment" />
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Recent orders</h2>
          <Link to="/portal/orders" className="text-sm text-muted-foreground hover:text-foreground">
            View all ({orders.length})
          </Link>
        </div>
        {recent.length > 0 ? (
          <div className="grid gap-3">
            {recent.map((o) => (
              <div key={o.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
                <div className="min-w-0">
                  <span className="block font-mono text-xs text-muted-foreground">{o.id.slice(0, 8)} · {fmtDate(o.placedAt)}</span>
                  <span className="block text-sm font-medium">{formatInt(unitsOf(o))} units · {formatUsd(o.subtotalCents)}</span>
                </div>
                <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium">{STATUS_LABEL[o.status]}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card p-10 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-muted">
              <ShoppingBag className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
            </span>
            <p className="text-sm text-muted-foreground">No orders yet. Browse the catalog and your tier price is applied automatically.</p>
            <Link to="/catalog" className="text-sm font-medium text-brand hover:underline">Browse catalog →</Link>
          </div>
        )}
      </section>
    </div>
  );
}
