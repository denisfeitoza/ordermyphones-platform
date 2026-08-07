import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Check, X } from 'lucide-react';
import {
  useAdminOrders,
  useVariantAvailability,
  useApproveOrder,
  useRejectOrder,
  type AdminOrder,
  type AdminOrderStatus,
} from '@/data/adminOrders';
import { AdminHeading, Panel } from '@/components/admin/parts';
import { Button } from '@/components/ui/Button';
import { formatInt, formatUsd } from '@/lib/format';
import { cn } from '@/lib/utils';

const STATUS_LABEL: Record<AdminOrderStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  partially_approved: 'Partial',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};
const STATUS_CLS: Record<AdminOrderStatus, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  partially_approved: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
  rejected: 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300',
  cancelled: 'bg-muted text-muted-foreground',
};

const FILTERS: { key: AdminOrderStatus | 'all'; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'partially_approved', label: 'Partial' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
];

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function StatusChip({ status }: { status: AdminOrderStatus }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium', STATUS_CLS[status])}>
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Real-mode admin order queue. Master list + detail panel with Approve /
 * Reject, live per-line availability, and post-approval approved/short summary. */
export function RealAdminOrders() {
  const { data: orders, isLoading, isError } = useAdminOrders();
  const [filter, setFilter] = useState<AdminOrderStatus | 'all'>('pending');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = useMemo(() => {
    const all = orders ?? [];
    return filter === 'all' ? all : all.filter((o) => o.status === filter);
  }, [orders, filter]);

  const selected = (orders ?? []).find((o) => o.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <AdminHeading
        title="Orders"
        subtitle="Approve or reject placed orders · stock deducts on approval, shortfalls open reconciliation"
        action={
          <div className="scrollbar-hide flex gap-1 overflow-x-auto">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={cn(
                  'whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  filter === f.key ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:bg-muted',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        }
      />

      {isError ? (
        <p className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Could not load orders.
        </p>
      ) : isLoading ? (
        <p className="rounded-2xl border border-border bg-card p-16 text-center text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_420px] [&>*]:min-w-0">
          <div className="space-y-2">
            {list.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
                No orders in this status.
              </p>
            ) : (
              list.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setSelectedId(o.id)}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-2xl border bg-card p-4 text-left transition-colors',
                    selectedId === o.id ? 'border-foreground' : 'border-border hover:border-border/70 hover:bg-muted/40',
                  )}
                >
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold">{o.id.slice(0, 8).toUpperCase()}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {o.customerEmail ?? o.customerName ?? '—'} · {fmtDate(o.placedAt)} · {o.tier}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-mono text-sm font-semibold tabular-nums">{formatUsd(o.subtotalCents)}</span>
                    <StatusChip status={o.status} />
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="lg:sticky lg:top-20 lg:self-start">
            {selected ? (
              <OrderDetailPanel order={selected} onClose={() => setSelectedId(null)} />
            ) : (
              <Panel>
                <p className="py-10 text-center text-sm text-muted-foreground">Select an order to review and decide.</p>
              </Panel>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function OrderDetailPanel({ order, onClose }: { order: AdminOrder; onClose: () => void }) {
  const variantIds = useMemo(() => order.lines.map((l) => l.variantId), [order.lines]);
  const { data: availability } = useVariantAvailability(variantIds);
  const approve = useApproveOrder();
  const reject = useRejectOrder();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const isPending = order.status === 'pending';
  const showApproved = order.status === 'approved' || order.status === 'partially_approved';
  const anyShort = order.lines.some((l) => l.qtyApproved !== null && l.qtyApproved < l.qtyRequested);
  const busy = approve.isPending || reject.isPending;

  return (
    <Panel
      title={`Order ${order.id.slice(0, 8).toUpperCase()}`}
      action={
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full hover:bg-muted" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{order.customerEmail ?? '—'}</span>
          <StatusChip status={order.status} />
        </div>

        <ul className="divide-y divide-border rounded-xl border border-border">
          {order.lines.map((l) => {
            const avail = availability?.get(l.variantId);
            const short = isPending && avail !== undefined && avail < l.qtyRequested;
            return (
              <li key={l.id} className="space-y-1 px-3 py-2.5 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 truncate font-medium">{l.name}</span>
                  <span className="shrink-0 font-mono tabular-nums">{formatUsd(l.lineTotalCents)}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    Qty {formatInt(l.qtyRequested)}
                    {showApproved && l.qtyApproved !== null && (
                      <>
                        {' · '}
                        <span className={cn(l.qtyApproved < l.qtyRequested ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400')}>
                          approved {formatInt(l.qtyApproved)}
                        </span>
                      </>
                    )}
                  </span>
                  {isPending && (
                    <span className={cn('font-mono', short ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
                      {avail === undefined ? '…' : `${formatInt(avail)} avail`}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
          <span className="font-medium">Total</span>
          <span className="font-mono text-base font-semibold tabular-nums">{formatUsd(order.subtotalCents)}</span>
        </div>

        {order.status === 'rejected' && order.decisionReason && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:bg-rose-500/10 dark:text-rose-300">
            Rejected: {order.decisionReason}
          </p>
        )}

        {showApproved && (
          <div className="rounded-lg bg-muted/50 px-3 py-2.5 text-xs">
            {anyShort ? (
              <p className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2} />
                Partially approved — shortfalls opened in reconciliation.
              </p>
            ) : (
              <p className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                <Check className="h-3.5 w-3.5" strokeWidth={2} />
                Fully approved and deducted.
              </p>
            )}
            <Link to="/admin/reconciliation" className="mt-1.5 inline-flex items-center gap-1 font-medium text-foreground hover:underline">
              Open reconciliation
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
            </Link>
          </div>
        )}

        {(approve.isError || reject.isError) && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {(approve.error as Error)?.message ?? (reject.error as Error)?.message ?? 'Action failed.'}
          </p>
        )}

        {isPending && !rejecting && (
          <div className="flex gap-2">
            <Button variant="primary" className="flex-1" disabled={busy} onClick={() => approve.mutate(order.id)}>
              {approve.isPending ? 'Approving…' : 'Approve'}
            </Button>
            <Button variant="outline" className="flex-1" disabled={busy} onClick={() => setRejecting(true)}>
              Reject
            </Button>
          </div>
        )}

        {isPending && rejecting && (
          <div className="space-y-2">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason for rejection (optional)"
              rows={2}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <div className="flex gap-2">
              <Button
                variant="primary"
                className="flex-1"
                disabled={busy}
                onClick={() => reject.mutate({ orderId: order.id, reason }, { onSuccess: () => setRejecting(false) })}
              >
                {reject.isPending ? 'Rejecting…' : 'Confirm reject'}
              </Button>
              <Button variant="outline" className="flex-1" disabled={busy} onClick={() => setRejecting(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
