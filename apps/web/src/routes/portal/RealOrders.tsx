import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ShoppingBag, PackageCheck, Clock, XCircle, AlertTriangle, Ban, FileDown, FileText } from 'lucide-react';
import { useMyOrders, type RealOrder, type RealOrderLine, type RealOrderStatus } from '@/data/realOrders';
import { PageHeading } from '@/components/portal/parts';
import { Button, buttonVariants } from '@/components/ui/Button';
import { exportDocCsv, exportDocPdf, type ExportDoc } from '@/lib/export';
import { formatUsd, formatInt } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useI18n } from '@/i18n';

/** Build the printable/export doc for a real order. isTest carries through so
 *  a rehearsal order is stamped TEST on the PDF/CSV (TEST-READY-V1 §4). */
function realOrderToDoc(o: RealOrder): ExportDoc {
  return {
    title: 'Order',
    reference: o.id.slice(0, 8).toUpperCase(),
    business: '',
    tierLabel: o.tier.charAt(0).toUpperCase() + o.tier.slice(1),
    dateLabel: fmtDate(o.placedAt),
    lines: o.lines.map((l) => ({
      model: l.model,
      variant: `${l.capacity} · ${l.lockStatus === 'unlocked' ? 'Unlocked' : `${l.carrier} Locked`}`,
      qty: l.qtyRequested,
      unitPriceCents: l.unitPriceCents,
      lineTotalCents: l.lineTotalCents,
    })),
    subtotalCents: o.subtotalCents,
    savingsCents: 0,
    isTest: o.isTest,
  };
}

const STATUS: Record<RealOrderStatus, { label: string; cls: string; icon: typeof Clock }> = {
  pending: { label: 'Pending approval', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300', icon: Clock },
  approved: { label: 'Approved', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300', icon: PackageCheck },
  partially_approved: { label: 'Partially approved', cls: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300', icon: AlertTriangle },
  rejected: { label: 'Rejected', cls: 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300', icon: XCircle },
  cancelled: { label: 'Cancelled', cls: 'bg-muted text-muted-foreground', icon: Ban },
};

function StatusPill({ status }: { status: RealOrderStatus }) {
  const { t } = useI18n();
  const meta = STATUS[status];
  const Icon = meta.icon;
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', meta.cls)}>
      <Icon className="h-3.5 w-3.5" strokeWidth={2} />
      {t(meta.label)}
    </span>
  );
}

function lineName(l: RealOrderLine): string {
  const lock = l.lockStatus === 'unlocked' ? 'Unlocked' : `${l.carrier} Locked`;
  return `${l.model} · ${l.capacity} · ${lock}`;
}

function units(o: RealOrder): number {
  return o.lines.reduce((s, l) => s + l.qtyRequested, 0);
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** Real-mode portal orders list — the signed-in customer's orders from Supabase. */
export function RealOrdersList() {
  const { t } = useI18n();
  const { data: orders, isLoading, isError } = useMyOrders();
  const list = orders ?? [];

  return (
    <div className="space-y-6">
      <PageHeading
        title="Orders"
        subtitle={`${list.length} ${list.length === 1 ? t('order') : t('orders')} · ${t('tap any order for line status & approval detail')}`}
      />

      {isError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {t('Could not load your orders. Please try again shortly.')}
        </div>
      ) : isLoading ? (
        <div className="rounded-2xl border border-border bg-card p-16 text-center text-sm text-muted-foreground">{t('Loading…')}</div>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border py-16 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-muted">
            <ShoppingBag className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
          </div>
          <div>
            <p className="font-medium">{t('No orders yet')}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t('Your placed orders will land here.')}</p>
          </div>
          <Link to="/catalog" className={cn(buttonVariants())}>
            {t('Browse catalog')}
          </Link>
        </div>
      ) : (
        <div className="grid gap-3">
          {list.map((o) => (
            <Link
              key={o.id}
              to={`/portal/orders/${o.id}`}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-border/70 hover:bg-muted/40"
            >
              <div className="min-w-0">
                <p className="font-mono text-sm font-semibold">{o.id.slice(0, 8).toUpperCase()}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {fmtDate(o.placedAt)} · {units(o)} {units(o) === 1 ? t('unit') : t('units')}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="font-mono text-sm font-semibold tabular-nums">{formatUsd(o.subtotalCents)}</span>
                <StatusPill status={o.status} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** Real-mode portal order detail — per-line requested vs approved, prices, status. */
export function RealOrderDetail() {
  const { t } = useI18n();
  const { id } = useParams();
  const { data: orders, isLoading } = useMyOrders();
  const order = orders?.find((o) => o.id === id);

  if (isLoading) {
    return <div className="py-16 text-center text-sm text-muted-foreground">{t('Loading…')}</div>;
  }

  if (!order) {
    return (
      <div className="space-y-4">
        <Link to="/portal/orders" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" strokeWidth={2} />
          {t('Back to orders')}
        </Link>
        <div className="rounded-2xl border border-dashed border-border py-16 text-center">
          <p className="font-medium">{t('Order not found')}</p>
        </div>
      </div>
    );
  }

  const showApproved = order.status === 'approved' || order.status === 'partially_approved';
  // On a partial, line totals are priced for the REQUESTED qty (matching the
  // placement-time subtotal), so label the total as ordered — not approved — to
  // avoid implying the shipped/approved amount. Billing is off-system (D8).
  const anyShort = order.lines.some((l) => l.qtyApproved !== null && l.qtyApproved < l.qtyRequested);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-6"
    >
      <Link to="/portal/orders" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" strokeWidth={2} />
        {t('Back to orders')}
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-mono text-2xl font-semibold tracking-tight">{order.id.slice(0, 8).toUpperCase()}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('Placed')} {fmtDate(order.placedAt)} · {units(order)} {units(order) === 1 ? t('unit') : t('units')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {order.isTest && (
            <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-100 px-2 py-1 text-[0.65rem] font-bold uppercase tracking-wide text-amber-900 dark:bg-amber-500/15 dark:text-amber-300">
              TEST
            </span>
          )}
          <StatusPill status={order.status} />
          <Button variant="outline" size="sm" onClick={() => void exportDocPdf(realOrderToDoc(order))}>
            <FileDown className="h-4 w-4" strokeWidth={2} aria-hidden />
            {t('PDF')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportDocCsv(realOrderToDoc(order))}>
            <FileText className="h-4 w-4" strokeWidth={2} aria-hidden />
            {t('CSV')}
          </Button>
        </div>
      </div>

      {order.status === 'rejected' && order.decisionReason && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
          <span className="font-medium">{t('Reason')}: </span>
          {order.decisionReason}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px] [&>*]:min-w-0">
        <section className="rounded-2xl border border-border bg-card">
          <header className="border-b border-border px-5 py-3.5">
            <h2 className="text-sm font-medium">{t('Items')}</h2>
          </header>
          <ul className="divide-y divide-border">
            {order.lines.map((l) => {
              const short = showApproved && l.qtyApproved !== null && l.qtyApproved < l.qtyRequested;
              return (
                <li key={l.id} className="flex items-center justify-between gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{lineName(l)}</p>
                    <p className="text-xs text-muted-foreground">
                      {t('Qty')} {formatInt(l.qtyRequested)}
                      {showApproved && l.qtyApproved !== null && (
                        <>
                          {' · '}
                          <span className={cn(short ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400')}>
                            {t('Approved')} {formatInt(l.qtyApproved)}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm font-semibold tabular-nums">{formatUsd(l.lineTotalCents)}</p>
                    <p className="font-mono text-xs text-muted-foreground">{formatUsd(l.unitPriceCents)} {t('ea')}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <aside className="lg:sticky lg:top-28 lg:self-start">
          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-sm font-medium">{t('Summary')}</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <dt>{t('Tier')}</dt>
                <dd className="capitalize">{order.tier}</dd>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <dt>{t('Shipping')}</dt>
                <dd>{t('Arranged separately')}</dd>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-3">
                <dt className="font-medium">{showApproved && anyShort ? t('Ordered total') : t('Total')}</dt>
                <dd className="font-mono text-lg font-semibold tabular-nums">{formatUsd(order.subtotalCents)}</dd>
              </div>
            </dl>

            {order.shippingAddress?.street && (
              <div className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">
                <p className="mb-1 font-medium text-foreground">{t('Ship to')}</p>
                <p>{order.shippingAddress.street}</p>
                <p>
                  {[order.shippingAddress.city, order.shippingAddress.state, order.shippingAddress.zip].filter(Boolean).join(', ')}
                </p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </motion.div>
  );
}
