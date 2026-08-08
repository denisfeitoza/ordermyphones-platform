import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Check, Minus, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import {
  useAdminOrders,
  useVariantAvailability,
  useApproveOrder,
  useRejectOrder,
  useEditOrder,
  type AdminOrder,
  type AdminOrderStatus,
  type ShippingAddress,
} from '@/data/adminOrders';
import { useOrderEvents } from '@/data/orderEvents';
import { useRealCatalog } from '@/data/realCatalog';
import { OrderTimeline } from '@/components/orders/OrderTimeline';
import { AdminHeading, Panel } from '@/components/admin/parts';
import { Button } from '@/components/ui/Button';
import { formatInt, formatUsd } from '@/lib/format';
import { useI18n } from '@/i18n';
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

export function StatusChip({ status }: { status: AdminOrderStatus }) {
  const { t } = useI18n();
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium', STATUS_CLS[status])}>
      {t(STATUS_LABEL[status])}
    </span>
  );
}

/** Real-mode admin order queue. Master list + detail panel with Approve /
 * Reject, live per-line availability, and post-approval approved/short summary. */
export function RealAdminOrders() {
  const { t } = useI18n();
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
                {t(f.label)}
              </button>
            ))}
          </div>
        }
      />

      {isError ? (
        <p className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {t('Could not load orders.')}
        </p>
      ) : isLoading ? (
        <p className="rounded-2xl border border-border bg-card p-16 text-center text-sm text-muted-foreground">{t('Loading…')}</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_420px] [&>*]:min-w-0">
          <div className="space-y-2">
            {list.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
                {t('No orders in this status.')}
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
                <p className="py-10 text-center text-sm text-muted-foreground">{t('Select an order to review and decide.')}</p>
              </Panel>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function OrderDetailPanel({ order, onClose }: { order: AdminOrder; onClose: () => void }) {
  const { t } = useI18n();
  const variantIds = useMemo(() => order.lines.map((l) => l.variantId), [order.lines]);
  const { data: availability } = useVariantAvailability(variantIds);
  const { data: events } = useOrderEvents(order.id);
  const approve = useApproveOrder();
  const reject = useRejectOrder();
  const [rejecting, setRejecting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState('');

  const isPending = order.status === 'pending';
  const showApproved = order.status === 'approved' || order.status === 'partially_approved';
  const anyShort = order.lines.some((l) => l.qtyApproved !== null && l.qtyApproved < l.qtyRequested);
  const busy = approve.isPending || reject.isPending;

  return (
    <Panel
      title={`${t('Order')} ${order.id.slice(0, 8).toUpperCase()}`}
      action={
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full hover:bg-muted" aria-label={t('Close')}>
          <X className="h-4 w-4" />
        </button>
      }
    >
      {editing ? (
        <OrderEditor order={order} onDone={() => setEditing(false)} />
      ) : (
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
                      {t('Qty')} {formatInt(l.qtyRequested)}
                      {showApproved && l.qtyApproved !== null && (
                        <>
                          {' · '}
                          <span className={cn(l.qtyApproved < l.qtyRequested ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400')}>
                            {t('approved')} {formatInt(l.qtyApproved)}
                          </span>
                        </>
                      )}
                    </span>
                    {isPending && (
                      <span className={cn('font-mono', short ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
                        {avail === undefined ? '…' : `${formatInt(avail)} ${t('avail')}`}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
            <span className="font-medium">{t('Total')}</span>
            <span className="font-mono text-base font-semibold tabular-nums">{formatUsd(order.subtotalCents)}</span>
          </div>

          {(order.shippingAddress?.street || order.note) && (
            <div className="space-y-1.5 rounded-lg bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
              {order.shippingAddress?.street && (
                <p>
                  <span className="font-medium text-foreground">{t('Ship to')}: </span>
                  {[order.shippingAddress.street, order.shippingAddress.city, order.shippingAddress.state, order.shippingAddress.zip]
                    .filter(Boolean)
                    .join(', ')}
                </p>
              )}
              {order.note && (
                <p>
                  <span className="font-medium text-foreground">{t('Note')}: </span>
                  {order.note}
                </p>
              )}
            </div>
          )}

          {order.status === 'rejected' && order.decisionReason && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:bg-rose-500/10 dark:text-rose-300">
              {t('Rejected')}: {order.decisionReason}
            </p>
          )}

          {showApproved && (
            <div className="rounded-lg bg-muted/50 px-3 py-2.5 text-xs">
              {anyShort ? (
                <p className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2} />
                  {t('Partially approved — shortfalls opened in reconciliation.')}
                </p>
              ) : (
                <p className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                  <Check className="h-3.5 w-3.5" strokeWidth={2} />
                  {t('Fully approved and deducted.')}
                </p>
              )}
              <Link to="/admin/reconciliation" className="mt-1.5 inline-flex items-center gap-1 font-medium text-foreground hover:underline">
                {t('Open reconciliation')}
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
              </Link>
            </div>
          )}

          {(approve.isError || reject.isError) && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {(approve.error as Error)?.message ?? (reject.error as Error)?.message ?? t('Action failed.')}
            </p>
          )}

          {isPending && !rejecting && (
            <div className="space-y-2">
              <Button variant="outline" className="w-full" disabled={busy} onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" strokeWidth={2} />
                {t('Edit order')}
              </Button>
              <div className="flex gap-2">
                <Button variant="primary" className="flex-1" disabled={busy} onClick={() => approve.mutate(order.id)}>
                  {approve.isPending ? t('Approving…') : t('Approve')}
                </Button>
                <Button variant="outline" className="flex-1" disabled={busy} onClick={() => setRejecting(true)}>
                  {t('Reject')}
                </Button>
              </div>
            </div>
          )}

          {isPending && rejecting && (
            <div className="space-y-2">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t('Reason for rejection (optional)')}
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
                  {reject.isPending ? t('Rejecting…') : t('Confirm reject')}
                </Button>
                <Button variant="outline" className="flex-1" disabled={busy} onClick={() => setRejecting(false)}>
                  {t('Cancel')}
                </Button>
              </div>
            </div>
          )}

          {events && events.length > 0 && (
            <div className="border-t border-border pt-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('Order history')}</h3>
              <OrderTimeline
                placedAt={order.placedAt}
                status={order.status}
                decidedAt={order.decidedAt}
                decisionReason={order.decisionReason}
                events={events}
              />
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

interface EditLine {
  variantId: string;
  name: string;
  qty: number;
  unitPriceCents: number;
}

/** In-place full editor for a pending order. Admin adjusts quantities and unit
 * prices, removes or adds items, and edits the shipping address + note. Saving
 * calls admin_edit_order, which records the diff both sides can see. */
function OrderEditor({ order, onDone }: { order: AdminOrder; onDone: () => void }) {
  const { t } = useI18n();
  const edit = useEditOrder();
  const { items: listings } = useRealCatalog();

  const [lines, setLines] = useState<EditLine[]>(() =>
    order.lines.map((l) => ({ variantId: l.variantId, name: l.name, qty: l.qtyRequested, unitPriceCents: l.unitPriceCents })),
  );
  const [addr, setAddr] = useState<ShippingAddress>(order.shippingAddress ?? {});
  const [note, setNote] = useState(order.note ?? '');
  const [reason, setReason] = useState('');
  const [addQuery, setAddQuery] = useState('');

  const subtotal = lines.reduce((s, l) => s + l.qty * l.unitPriceCents, 0);
  const existing = new Set(lines.map((l) => l.variantId));

  const matches = useMemo(() => {
    const q = addQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return listings
      .filter((v) => !existing.has(v.variantId) && `${v.model} ${v.capacity} ${v.sku}`.toLowerCase().includes(q))
      .slice(0, 6);
  }, [addQuery, listings, existing]);

  function setQty(idx: number, qty: number) {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, qty: Math.max(1, qty) } : l)));
  }
  function setPrice(idx: number, dollars: string) {
    const cents = Math.max(0, Math.round((parseFloat(dollars) || 0) * 100));
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, unitPriceCents: cents } : l)));
  }
  function remove(idx: number) {
    setLines((ls) => ls.filter((_, i) => i !== idx));
  }
  function addVariant(v: (typeof listings)[number]) {
    setLines((ls) => [
      ...ls,
      {
        variantId: v.variantId,
        name: `${v.model} · ${v.capacity}`,
        qty: 1,
        unitPriceCents: v.priceCents ?? 0,
      },
    ]);
    setAddQuery('');
  }

  function save() {
    edit.mutate(
      {
        orderId: order.id,
        items: lines.map((l) => ({ variant_id: l.variantId, qty: l.qty, unit_price_cents: l.unitPriceCents })),
        shippingAddress: addr,
        note,
        reason,
      },
      { onSuccess: onDone },
    );
  }

  const canSave = lines.length > 0 && lines.every((l) => l.qty > 0 && l.unitPriceCents >= 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{t('Editing order')}</span>
        <span className="text-xs text-muted-foreground">{order.customerEmail ?? '—'}</span>
      </div>

      <ul className="space-y-2">
        {lines.map((l, idx) => (
          <li key={l.variantId} className="rounded-xl border border-border p-3">
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{l.name}</span>
              <button
                type="button"
                onClick={() => remove(idx)}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                aria-label={t('Remove')}
              >
                <Trash2 className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center rounded-lg border border-border">
                <button type="button" onClick={() => setQty(idx, l.qty - 1)} className="grid h-8 w-8 place-items-center hover:bg-muted" aria-label={t('Decrease')}>
                  <Minus className="h-3.5 w-3.5" strokeWidth={2.5} />
                </button>
                <input
                  type="number"
                  min={1}
                  value={l.qty}
                  onChange={(e) => setQty(idx, parseInt(e.target.value, 10) || 1)}
                  className="w-12 border-x border-border bg-transparent py-1.5 text-center font-mono text-sm outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button type="button" onClick={() => setQty(idx, l.qty + 1)} className="grid h-8 w-8 place-items-center hover:bg-muted" aria-label={t('Increase')}>
                  <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                </button>
              </div>
              <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                {t('Unit price')}
                <span className="relative">
                  <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={(l.unitPriceCents / 100).toString()}
                    onChange={(e) => setPrice(idx, e.target.value)}
                    className="w-24 rounded-lg border border-border bg-transparent py-1.5 pl-5 pr-2 text-right font-mono text-sm outline-none focus:border-brand [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </span>
              </label>
              <span className="ml-auto font-mono text-sm font-semibold tabular-nums">{formatUsd(l.qty * l.unitPriceCents)}</span>
            </div>
          </li>
        ))}
      </ul>

      {/* Add item */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={2} />
          <input
            value={addQuery}
            onChange={(e) => setAddQuery(e.target.value)}
            placeholder={t('Add item — search model or SKU')}
            className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-brand"
          />
        </div>
        {matches.length > 0 && (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {matches.map((v) => (
              <li key={v.variantId}>
                <button
                  type="button"
                  onClick={() => addVariant(v)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <span className="min-w-0 truncate">
                    {v.model} · {v.capacity} <span className="text-xs text-muted-foreground">{v.sku}</span>
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums">{v.priceCents !== null ? formatUsd(v.priceCents) : '—'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Shipping address */}
      <div className="space-y-2 border-t border-border pt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('Ship to')}</p>
        <input
          value={addr.street ?? ''}
          onChange={(e) => setAddr((a) => ({ ...a, street: e.target.value }))}
          placeholder={t('Street')}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <div className="grid grid-cols-[1fr_70px_90px] gap-2">
          <input value={addr.city ?? ''} onChange={(e) => setAddr((a) => ({ ...a, city: e.target.value }))} placeholder={t('City')} className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand" />
          <input value={addr.state ?? ''} onChange={(e) => setAddr((a) => ({ ...a, state: e.target.value }))} placeholder={t('State')} className="rounded-lg border border-border bg-background px-2 py-2 text-sm outline-none focus:border-brand" />
          <input value={addr.zip ?? ''} onChange={(e) => setAddr((a) => ({ ...a, zip: e.target.value }))} placeholder={t('ZIP')} className="rounded-lg border border-border bg-background px-2 py-2 text-sm outline-none focus:border-brand" />
        </div>
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t('Order note (optional)')}
        rows={2}
        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
      />
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={t('Why are you editing? (shown to the customer)')}
        rows={2}
        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
      />

      <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
        <span className="font-medium">{t('New total')}</span>
        <span className="font-mono text-base font-semibold tabular-nums">{formatUsd(subtotal)}</span>
      </div>

      {edit.isError && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {(edit.error as Error)?.message ?? t('Action failed.')}
        </p>
      )}

      <div className="flex gap-2">
        <Button variant="primary" className="flex-1" disabled={!canSave || edit.isPending} onClick={save}>
          {edit.isPending ? t('Saving…') : t('Save changes')}
        </Button>
        <Button variant="outline" className="flex-1" disabled={edit.isPending} onClick={onDone}>
          {t('Cancel')}
        </Button>
      </div>
    </div>
  );
}
