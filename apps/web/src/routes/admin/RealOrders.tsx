import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Check, ClipboardList, Minus, Pencil, Plus, Search, Trash2, Truck, X } from 'lucide-react';
import { useAdminOrders, useVariantAvailability, useApproveOrder, useRejectOrder, useEditOrder, useMarkShipped, useSetTracking, useBulkOrderAction, type AdminOrder, type AdminOrderStatus, type ShippingAddress, type BulkResult, useOpenReconciliations } from '@/data/adminOrders';
import { exportPickingSheetPdf } from '@/lib/export';
import { useOrderEvents } from '@/data/orderEvents';
import { useRealCatalog } from '@/data/realCatalog';
import { TrackingTimeline } from '@/components/store/TrackingTimeline';
import { OrderTimeline } from '@/components/orders/OrderTimeline';
import { AdminHeading, Panel } from '@/components/admin/parts';
import { Button } from '@/components/ui/Button';
import { formatDate, formatInt, formatUsd } from '@/lib/format';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { parseMoneyToCents } from '@/lib/money';
import { adminErrorMessage } from '@/lib/adminErrors';
import { supabase } from '@/lib/supabase';
import { useCancelOrder } from '@/data/realOrders';
import { isShortOrder, orderValueCents } from '@/lib/orderTotals';
import { REQUIREMENT_LABEL } from '@/lib/requirements';
import { OrderMoneyPanel } from '@/components/admin/OrderMoneyPanel';
import { PAYMENT_STATE_STYLE, paymentState } from '@/lib/payment';
import { billedLines, salesOrdersQuickBooksCsv, soNumber } from '@/lib/salesOrder';

const STATUS_LABEL: Record<AdminOrderStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  partially_approved: 'Partial',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  shipped: 'Shipped',
};
const STATUS_CLS: Record<AdminOrderStatus, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  partially_approved: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
  shipped: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-300',
  rejected: 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300',
  cancelled: 'bg-muted text-muted-foreground',
};

const FILTERS: { key: AdminOrderStatus | 'all'; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'partially_approved', label: 'Partial' },
  { key: 'approved', label: 'Approved' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
];

const CARRIERS = ['UPS', 'FedEx', 'USPS', 'DHL', 'Other'] as const;

/** Add or fix the carrier + tracking of an order already shipped (set_order_tracking). */
function TrackingForm({ order, onDone }: { order: AdminOrder; onDone: () => void }) {
  const { t } = useI18n();
  const save = useSetTracking();
  const known = (CARRIERS as readonly string[]).includes(order.trackingCarrier ?? '');
  const [carrier, setCarrier] = useState<string>(order.trackingCarrier ? (known ? order.trackingCarrier : 'Other') : 'UPS');
  const [otherCarrier, setOtherCarrier] = useState(known ? '' : (order.trackingCarrier ?? ''));
  const [tracking, setTracking] = useState(order.trackingNumber ?? '');
  const carrierValue = carrier === 'Other' && otherCarrier.trim() ? otherCarrier.trim() : carrier;
  return (
    <form
      className="mt-2 space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({ orderId: order.id, carrier: carrierValue, tracking: tracking.trim() }, { onSuccess: onDone });
      }}
    >
      <div className="grid grid-cols-[110px_1fr] gap-2">
        <select value={carrier} onChange={(e) => setCarrier(e.target.value)} className="min-h-11 rounded-lg border border-border bg-background px-2 text-sm text-foreground" aria-label={t('Carrier')}>
          {CARRIERS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          value={tracking}
          onChange={(e) => setTracking(e.target.value)}
          placeholder={t('Tracking number')}
          maxLength={100}
          autoFocus
          className="min-h-11 rounded-lg border border-border bg-background px-3 font-mono text-sm text-foreground outline-none focus:border-brand"
          aria-label={t('Tracking number')}
        />
      </div>
      {carrier === 'Other' && (
        <input
          value={otherCarrier}
          onChange={(e) => setOtherCarrier(e.target.value)}
          placeholder={t('Carrier name')}
          maxLength={40}
          className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-brand"
          aria-label={t('Carrier name')}
        />
      )}
      {save.isError && <p className="text-destructive">{adminErrorMessage(t, (save.error as Error).message)}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="primary" className="min-h-11 flex-1" disabled={save.isPending}>
          {save.isPending ? t('Saving…') : t('Save tracking')}
        </Button>
        <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={onDone} disabled={save.isPending}>
          {t('Cancel')}
        </Button>
      </div>
    </form>
  );
}

/** Approved (or partially approved) → shipped, with the manual carrier + tracking the plan calls for (J2 step 5). */
function ShipForm({ order, onDone }: { order: AdminOrder; onDone: () => void }) {
  const { t } = useI18n();
  const ship = useMarkShipped();
  const [carrier, setCarrier] = useState<string>('UPS');
  const [otherCarrier, setOtherCarrier] = useState('');
  const carrierValue = carrier === 'Other' && otherCarrier.trim() ? otherCarrier.trim() : carrier;
  const [tracking, setTracking] = useState('');
  const [note, setNote] = useState('');
  const [closeShortfalls, setCloseShortfalls] = useState(false);
  // Same rules as mark_order_shipped: nothing approved → nothing to ship; any
  // line short → the open shortfalls must be closed explicitly on shipping.
  const approvedUnits = order.lines.reduce((s, l) => s + (l.qtyApproved ?? 0), 0);
  // Open reconciliation rows for this order's lines (a shortfall already
  // closed in Reconciliation no longer needs the tick).
  const { data: openRecon = [] } = useOpenReconciliations();
  const lineIds = new Set(order.lines.map((l) => l.id));
  const shortLines = openRecon.filter((r) => lineIds.has(r.orderItemId)).length;
  const errorText = (() => {
    if (!ship.isError) return null;
    const msg = (ship.error as Error).message;
    if (msg.includes('nothing_to_ship')) return t('Nothing was approved on this order, so there is nothing to ship.');
    if (msg.includes('open_shortfall')) return t('This order still has open shortfalls. Tick the box to ship what was approved and close them.');
    return msg;
  })();
  if (approvedUnits === 0) {
    return (
      <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3 text-sm">
        <p className="text-muted-foreground">{t('Nothing was approved on this order, so there is nothing to ship.')}</p>
        <Button type="button" variant="outline" onClick={onDone}>
          {t('Close')}
        </Button>
      </div>
    );
  }
  return (
    <form
      className="space-y-2 rounded-xl border border-border bg-muted/30 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        ship.mutate(
          { orderId: order.id, carrier: carrierValue, tracking: tracking.trim(), note: note.trim(), closeShortfalls: shortLines > 0 && closeShortfalls },
          { onSuccess: onDone },
        );
      }}
    >
      <p className="text-xs font-medium">{t('Mark as shipped')}</p>
      <div className="grid grid-cols-[110px_1fr] gap-2">
        <select value={carrier} onChange={(e) => setCarrier(e.target.value)} className="rounded-lg border border-border bg-background px-2 py-2 text-sm" aria-label={t('Carrier')}>
          {CARRIERS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          value={tracking}
          onChange={(e) => setTracking(e.target.value)}
          placeholder={t('Tracking number')}
          className="rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-brand"
          aria-label={t('Tracking number')}
        />
      </div>
      {carrier === 'Other' && (
        <input
          value={otherCarrier}
          onChange={(e) => setOtherCarrier(e.target.value)}
          placeholder={t('Carrier name')}
          maxLength={40}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
          aria-label={t('Carrier name')}
        />
      )}
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t('Note for the customer (optional)')}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
      />
      {shortLines > 0 && (
        <label className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-xs">
          <input type="checkbox" className="mt-0.5 h-4 w-4" checked={closeShortfalls} onChange={(e) => setCloseShortfalls(e.target.checked)} />
          <span>
            {t('Ship the approved units only')} ({approvedUnits}) {t('and close the open shortfalls on')} {shortLines}{' '}
            {shortLines === 1 ? t('line') : t('lines')}. {t('The missing units will not be sent later.')}
          </span>
        </label>
      )}
      {errorText && <p className="text-xs text-destructive">{errorText}</p>}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" className="flex-1" disabled={ship.isPending || (shortLines > 0 && !closeShortfalls)}>
          <Truck className="h-4 w-4" strokeWidth={2} />
          {ship.isPending ? t('Saving…') : t('Confirm shipped')}
        </Button>
        <Button type="button" variant="outline" onClick={onDone} disabled={ship.isPending}>
          {t('Cancel')}
        </Button>
      </div>
    </form>
  );
}

/**
 * One picking row per (line, warehouse) the stock actually came from: approval
 * and reconciliation fulfils can split a line across warehouses, while
 * order_items.location_id only keeps the first one. Reads the order's ledger
 * movements (net of any cancel), falling back to the line's location.
 */
async function pickingDocWithDraws(order: AdminOrder) {
  const doc = pickingDoc(order);
  const { data, error } = await supabase
    .from('stock_movements')
    .select('variant_id, delta, location:stock_locations(display_name)')
    .eq('ref_type', 'orders')
    .eq('ref_id', order.id);
  if (error || !data?.length) return doc;
  const taken = new Map<string, Map<string, number>>();
  for (const m of data as unknown as { variant_id: string; delta: number; location: { display_name: string } | null }[]) {
    const byLoc = taken.get(m.variant_id) ?? new Map<string, number>();
    const loc = m.location?.display_name ?? '—';
    byLoc.set(loc, (byLoc.get(loc) ?? 0) - m.delta);
    taken.set(m.variant_id, byLoc);
  }
  const lines = order.lines.flatMap((l) => {
    const byLoc = taken.get(l.variantId);
    const draws = byLoc ? [...byLoc.entries()].filter(([, q]) => q > 0) : [];
    if (!draws.length) return (l.qtyApproved ?? 0) > 0 ? [{ sku: l.sku, name: l.name, qty: l.qtyApproved ?? 0, location: l.locationName }] : [];
    return draws.map(([location, qty]) => ({ sku: l.sku, name: l.name, qty, location }));
  });
  return { ...doc, lines };
}

function pickingDoc(order: AdminOrder) {
  const a = order.shippingAddress;
  return {
    reference: order.id.slice(0, 8).toUpperCase(),
    dateLabel: formatDate(order.placedAt), // the picking sheet is an English document
    customer: order.customerName || order.customerEmail || '—',
    shipTo: [a?.street, [a?.city, a?.state, a?.zip].filter(Boolean).join(', ')].filter((s): s is string => !!s),
    note: order.note,
    lines: order.lines
      .filter((l) => (l.qtyApproved ?? 0) > 0)
      .map((l) => ({ sku: l.sku, name: l.name, qty: l.qtyApproved ?? 0, location: l.locationName })),
    isTest: order.isTest,
  };
}


export function StatusChip({ status }: { status: AdminOrderStatus }) {
  const { t } = useI18n();
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium', STATUS_CLS[status])}>
      {t(STATUS_LABEL[status])}
    </span>
  );
}

const ORDERS_PAGE = 50;

/** Real-mode admin order queue. Master list + detail panel with Approve /
 * Reject, live per-line availability, and post-approval approved/short summary. */
/** Invoiced orders in the current list → QuickBooks invoice-import CSV (draft column set). */
function exportQuickBooks(orders: AdminOrder[]) {
  const docs = orders
    .filter((o) => o.invoicedAt && ['approved', 'partially_approved', 'shipped'].includes(o.status))
    .map((o) => ({
      number: soNumber(o.id),
      orderDate: o.placedAt,
      invoiceDate: o.invoicedAt,
      dueDate: o.dueAt,
      terms: o.paymentTerms,
      status: o.status,
      billTo: [],
      shipTo: [],
      shippingMethod: o.shippingMethod,
      shippingAccount: null,
      shippingCents: o.shippingCents,
      note: o.note,
      lines: billedLines(o.status, o.lines, (l) => l.name),
      paid: o.paymentStatus === 'paid',
      isTest: o.isTest,
      customer: o.customerName ?? o.customerEmail ?? '',
    }));
  const url = URL.createObjectURL(new Blob([salesOrdersQuickBooksCsv(docs)], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `quickbooks-sales-orders-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function RealAdminOrders() {
  const { t, lang } = useI18n();
  const { data: orders, isLoading, isError } = useAdminOrders();
  const [filter, setFilter] = useState<AdminOrderStatus | 'all'>('pending');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(ORDERS_PAGE);
  // Bulk mode: approve many pending orders, or ship many approved ones.
  // Partial orders are left out: shipping them must close their shortfalls,
  // a per-order decision made in the detail panel.
  const bulkAction: 'approve' | 'ship' | null = filter === 'pending' ? 'approve' : filter === 'approved' ? 'ship' : null;
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);
  const bulk = useBulkOrderAction();
  const togglePick = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const filtered = useMemo(() => {
    const all = orders ?? [];
    const byStatus = filter === 'all' ? all : all.filter((o) => o.status === filter);
    const q = query.trim().toLowerCase();
    if (!q) return byStatus;
    // Order number (any part of the id), customer e-mail or name.
    return byStatus.filter((o) => `${o.id} ${o.customerEmail ?? ''} ${o.customerName ?? ''}`.toLowerCase().includes(q));
  }, [orders, filter, query]);
  const list = filtered.slice(0, shown);

  const selected = (orders ?? []).find((o) => o.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <AdminHeading
        title="Orders"
        subtitle="Approve or reject placed orders · stock deducts on approval, shortfalls open reconciliation"
        action={
          <div className="scrollbar-hide flex gap-1 overflow-x-auto">
            <button
              type="button"
              onClick={() => exportQuickBooks(filtered)}
              className="inline-flex whitespace-nowrap rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
              title={t('Sales Orders of the invoiced orders in this list, as a QuickBooks invoice import')}
            >
              {t('QuickBooks CSV')}
            </button>
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => {
                  setFilter(f.key);
                  setShown(ORDERS_PAGE);
                  setPicked(new Set());
                  setConfirmBulk(false);
                  setBulkResult(null);
                }}
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
          {/* Phones show either the list or the open order, never the order
              below a long list. */}
          <div className={cn('space-y-2', selected && 'hidden lg:block')}>
            <label className="relative block">
              <span className="sr-only">{t('Search orders')}</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={2} />
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShown(ORDERS_PAGE);
                }}
                placeholder={t('Search by order number, e-mail or name')}
                className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-brand"
              />
            </label>
            {bulkAction && list.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card px-4 py-2.5 text-sm">
                <label className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-brand"
                    checked={picked.size > 0 && list.every((o) => picked.has(o.id))}
                    onChange={(e) => setPicked(e.target.checked ? new Set(list.map((o) => o.id)) : new Set())}
                  />
                  {picked.size > 0 ? `${picked.size} ${t('selected')}` : t('Select all shown')}
                </label>
                {picked.size > 0 && !confirmBulk && (
                  <Button size="sm" variant="brand" className="ml-auto" onClick={() => { setBulkResult(null); setConfirmBulk(true); }}>
                    {bulkAction === 'approve' ? <Check className="h-4 w-4" strokeWidth={2.5} /> : <Truck className="h-4 w-4" strokeWidth={2} />}
                    {bulkAction === 'approve' ? t('Approve selected') : t('Mark selected shipped')}
                  </Button>
                )}
                {confirmBulk && (
                  <div className="flex basis-full flex-wrap items-center gap-2 border-t border-border pt-2.5">
                    <p className="min-w-0 flex-1 text-sm">
                      {bulkAction === 'approve'
                        ? `${t('Approve')} ${picked.size} ${picked.size === 1 ? t('order') : t('orders')}? ${t('Stock deducts now; shortfalls open reconciliations.')}`
                        : `${t('Mark')} ${picked.size} ${picked.size === 1 ? t('order') : t('orders')} ${t('as shipped, without tracking?')}`}
                    </p>
                    <Button size="sm" variant="outline" onClick={() => setConfirmBulk(false)} disabled={bulk.isPending}>
                      {t('Cancel')}
                    </Button>
                    <Button
                      size="sm"
                      variant="brand"
                      disabled={bulk.isPending}
                      onClick={() =>
                        bulk.mutate(
                          { action: bulkAction, orderIds: [...picked] },
                          {
                            onSuccess: (r) => {
                              setBulkResult(r);
                              setPicked(new Set(r.failed.map((f) => f.orderId)));
                              setConfirmBulk(false);
                            },
                          },
                        )
                      }
                    >
                      {bulk.isPending ? t('Working…') : t('Confirm')}
                    </Button>
                  </div>
                )}
                {bulkResult && (
                  <div className="basis-full space-y-1 border-t border-border pt-2.5 text-sm" role="status">
                    <p>
                      {bulkResult.done} {bulkAction === 'approve' ? t('approved') : t('marked shipped')}
                      {bulkResult.short > 0 ? ` · ${bulkResult.short} ${t('with shortfalls in reconciliation')}` : ''}
                      {bulkResult.failed.length > 0 ? ` · ${bulkResult.failed.length} ${t('failed (still selected)')}` : ''}
                    </p>
                    {bulkResult.failed.map((f) => (
                      <p key={f.orderId} className="text-xs text-destructive">
                        <span className="font-mono">{f.orderId.slice(0, 8).toUpperCase()}</span> · {adminErrorMessage(t, f.message)}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
            {list.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
                {t('No orders in this status.')}
              </p>
            ) : (
              list.map((o) => (
                <div key={o.id} className="flex items-stretch gap-2">
                {bulkAction && (
                  <label className="grid w-11 shrink-0 cursor-pointer place-items-center rounded-2xl border border-border bg-card">
                    <span className="sr-only">{t('Select order')} {o.id.slice(0, 8).toUpperCase()}</span>
                    <input type="checkbox" className="h-4 w-4 accent-brand" checked={picked.has(o.id)} onChange={() => togglePick(o.id)} />
                  </label>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(o.id);
                    if (window.matchMedia('(max-width: 1023px)').matches) window.scrollTo({ top: 0 });
                  }}
                  className={cn(
                    'flex w-full min-w-0 items-center justify-between gap-3 rounded-2xl border bg-card p-4 text-left transition-colors',
                    selectedId === o.id ? 'border-foreground' : 'border-border hover:border-border/70 hover:bg-muted/40',
                  )}
                >
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold">{o.id.slice(0, 8).toUpperCase()}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {o.customerEmail ?? o.customerName ?? '—'} · {formatDate(o.placedAt, lang)} · {o.tier}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-mono text-sm font-semibold tabular-nums">{formatUsd(orderValueCents(o.status, o.subtotalCents, o.lines))}</span>
                    {(() => {
                      const ps = paymentState(o);
                      return ps === 'overdue' || ps === 'paid' ? (
                        <span className={cn('hidden rounded-full px-2 py-0.5 text-[0.65rem] font-semibold sm:inline', PAYMENT_STATE_STYLE[ps].cls)}>{t(PAYMENT_STATE_STYLE[ps].label)}</span>
                      ) : null;
                    })()}
                    <StatusChip status={o.status} />
                  </div>
                </button>
                </div>
              ))
            )}
            {filtered.length > list.length && (
              <Button variant="outline" className="w-full" onClick={() => setShown((n) => n + ORDERS_PAGE)}>
                {t('Show more')} ({filtered.length - list.length})
              </Button>
            )}
          </div>

          <div className={cn('lg:sticky lg:top-20 lg:self-start', !selected && 'hidden lg:block')}>
            {selected ? (
              // key: switching orders must remount the panel, or the editor/reject
              // state of the previous order would be saved onto this one.
              <OrderDetailPanel key={selected.id} order={selected} onClose={() => setSelectedId(null)} />
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
  const { t, lang } = useI18n();
  const variantIds = useMemo(() => order.lines.map((l) => l.variantId), [order.lines]);
  const { data: availability } = useVariantAvailability(variantIds);
  const { data: events } = useOrderEvents(order.id);
  const approve = useApproveOrder();
  const reject = useRejectOrder();
  const [rejecting, setRejecting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [shipping, setShipping] = useState(false);
  const [editingTracking, setEditingTracking] = useState(false);
  const [reason, setReason] = useState('');

  const isPending = order.status === 'pending';
  const isShipped = order.status === 'shipped';
  const canFulfil = order.status === 'approved' || order.status === 'partially_approved';
  const showApproved = canFulfil || isShipped;
  const anyShort = order.lines.some((l) => l.qtyApproved !== null && l.qtyApproved < l.qtyRequested);
  const busy = approve.isPending || reject.isPending;

  return (
    <Panel
      title={`${t('Order')} ${order.id.slice(0, 8).toUpperCase()}`}
      action={
        <button onClick={onClose} className="-m-1.5 grid h-11 w-11 place-items-center rounded-full hover:bg-muted" aria-label={t('Close')}>
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

          {isShortOrder(order.status, order.subtotalCents, order.lines) && (
            <div className="flex items-center justify-between border-t border-border pt-3 text-sm text-muted-foreground">
              <span>{t('Ordered total')}</span>
              <span className="font-mono tabular-nums line-through">{formatUsd(order.subtotalCents)}</span>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
            <span className="font-medium">{isShortOrder(order.status, order.subtotalCents, order.lines) ? t('Approved total') : t('Total')}</span>
            <span className="font-mono text-base font-semibold tabular-nums">{formatUsd(orderValueCents(order.status, order.subtotalCents, order.lines))}</span>
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

          <OrderMoneyPanel order={order} />

          {order.status === 'rejected' && order.decisionReason && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:bg-rose-500/10 dark:text-rose-300">
              {t('Rejected')}: {order.decisionReason}
            </p>
          )}

          {isShipped && (
            <div className="rounded-lg bg-sky-50 px-3 py-2.5 text-xs text-sky-900 dark:bg-sky-500/10 dark:text-sky-200">
              <p className="flex items-center gap-1.5 font-medium">
                <Truck className="h-3.5 w-3.5" strokeWidth={2} />
                {t('Shipped')} {order.shippedAt ? formatDate(order.shippedAt, lang) : ''}
              </p>
              {!editingTracking && (
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                  {order.trackingCarrier || order.trackingNumber ? (
                    <p className="font-mono">{[order.trackingCarrier, order.trackingNumber].filter(Boolean).join(' · ')}</p>
                  ) : (
                    <p>{t('No tracking number yet.')}</p>
                  )}
                  <button type="button" onClick={() => setEditingTracking(true)} className="-my-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 font-medium underline-offset-2 hover:underline">
                    <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                    {order.trackingNumber ? t('Edit tracking') : t('Add tracking')}
                  </button>
                </div>
              )}
              {editingTracking && <TrackingForm order={order} onDone={() => setEditingTracking(false)} />}
              <TrackingTimeline orderId={order.id} carrier={order.trackingCarrier} trackingNumber={order.trackingNumber} className="mt-3" />
            </div>
          )}

          {canFulfil && !shipping && (
            <div className="space-y-2">
              <Button variant="outline" className="w-full" onClick={() => void pickingDocWithDraws(order).then(exportPickingSheetPdf)}>
                <ClipboardList className="h-4 w-4" strokeWidth={2} />
                {t('Picking sheet (PDF)')}
              </Button>
              <Button variant="primary" className="w-full" onClick={() => setShipping(true)}>
                <Truck className="h-4 w-4" strokeWidth={2} />
                {t('Mark as shipped')}
              </Button>
            </div>
          )}
          {canFulfil && shipping && <ShipForm order={order} onDone={() => setShipping(false)} />}

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

          {approve.isError && (approve.error as Error).message.includes('requirements_missing') ? (
            <div role="alert" className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-xs">
              <p>
                {t('This customer is missing what Enforcement requires before approval:')}{' '}
                <b>
                  {String((approve.error as Error & { details?: string }).details ?? '')
                    .split(',')
                    .filter(Boolean)
                    .map((k) => t(REQUIREMENT_LABEL[k] ?? k))
                    .join(', ')}
                </b>
                .
              </p>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => approve.mutate({ orderId: order.id, overrideRequirements: true })}>
                {t('Approve anyway (recorded in the audit log)')}
              </Button>
            </div>
          ) : (
            (approve.isError || reject.isError) && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {adminErrorMessage(t, (approve.error as Error)?.message ?? (reject.error as Error)?.message)}
              </p>
            )
          )}

          {(isPending || order.status === 'approved' || order.status === 'partially_approved') && !rejecting && !editing && (
            <AdminCancelOrder orderId={order.id} restoresStock={!isPending} />
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
  locationId: string | null;
  name: string;
  qtyStr: string;
  priceStr: string;
}

// Free-typing drafts → validated values. A controlled type="number" reformats
// on every keystroke (dropping the decimal point mid-typing and clashing with
// the pt-BR comma), so we hold raw strings and parse here. Accepts "," or ".".
const qtyOf = (s: string) => Math.max(0, Math.trunc(Number(s.replace(',', '.')) || 0));
// Unreadable prices ("1,299.00") parse to 0, which canSave refuses — never to $1.30.
const centsOf = (s: string) => parseMoneyToCents(s) ?? 0;

/** In-place full editor for a pending order. Admin adjusts quantities and unit
 * prices, removes or adds items, and edits the shipping address + note. Saving
 * calls admin_edit_order, which records the diff both sides can see. */
function OrderEditor({ order, onDone }: { order: AdminOrder; onDone: () => void }) {
  const { t } = useI18n();
  const edit = useEditOrder();
  const { items: listings } = useRealCatalog();

  // One row per (variant, requested warehouse) — the same key admin_edit_order
  // uses — so a "3 from Miami + 2 from Dallas" order stays split after a save.
  const [lines, setLines] = useState<EditLine[]>(() => {
    const byKey = new Map<string, EditLine>();
    for (const l of order.lines) {
      const key = `${l.variantId}|${l.requestedLocationId ?? ''}`;
      const prev = byKey.get(key);
      if (prev) prev.qtyStr = String(qtyOf(prev.qtyStr) + l.qtyRequested);
      else
        byKey.set(key, {
          variantId: l.variantId,
          locationId: l.requestedLocationId,
          name: l.requestedLocationName ? `${l.name} · ${l.requestedLocationName}` : l.name,
          qtyStr: String(l.qtyRequested),
          priceStr: (l.unitPriceCents / 100).toString(),
        });
    }
    return [...byKey.values()];
  });
  const [addr, setAddr] = useState<ShippingAddress>(order.shippingAddress ?? {});
  const [note, setNote] = useState(order.note ?? '');
  const [reason, setReason] = useState('');
  const [addQuery, setAddQuery] = useState('');

  const subtotal = lines.reduce((s, l) => s + qtyOf(l.qtyStr) * centsOf(l.priceStr), 0);
  const matches = useMemo(() => {
    const q = addQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    const existing = new Set(lines.map((l) => l.variantId));
    return listings
      .filter((v) => !existing.has(v.variantId) && `${v.model} ${v.capacity} ${v.sku}`.toLowerCase().includes(q))
      .slice(0, 6);
  }, [addQuery, listings, lines]);

  // Stepper nudges the numeric value; the text field holds a free-typing draft.
  function stepQty(idx: number, delta: number) {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, qtyStr: String(Math.max(1, qtyOf(l.qtyStr) + delta)) } : l)));
  }
  function setQtyStr(idx: number, s: string) {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, qtyStr: s.replace(/[^\d]/g, '') } : l)));
  }
  function setPriceStr(idx: number, s: string) {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, priceStr: s.replace(/[^\d.,]/g, '') } : l)));
  }
  function remove(idx: number) {
    setLines((ls) => ls.filter((_, i) => i !== idx));
  }
  function addVariant(v: (typeof listings)[number]) {
    setLines((ls) => [
      ...ls,
      {
        variantId: v.variantId,
        locationId: null,
        name: `${v.model} · ${v.capacity}`,
        qtyStr: '1',
        priceStr: v.priceCents ? (v.priceCents / 100).toString() : '',
      },
    ]);
    // Staff have no own tier price; fill the ORDER's tier price from prices.
    if (!v.priceCents) {
      void supabase
        .from('prices')
        .select('price_cents')
        .eq('variant_id', v.variantId)
        .eq('tier', order.tier)
        .maybeSingle()
        .then(({ data }) => {
          const cents = (data as { price_cents: number } | null)?.price_cents;
          if (cents) setLines((ls) => ls.map((l) => (l.variantId === v.variantId && l.priceStr === '' ? { ...l, priceStr: (cents / 100).toString() } : l)));
        });
    }
    setAddQuery('');
  }

  function save() {
    edit.mutate(
      {
        orderId: order.id,
        items: lines.map((l) => ({ variant_id: l.variantId, requested_location_id: l.locationId, qty: qtyOf(l.qtyStr), unit_price_cents: centsOf(l.priceStr) })),
        shippingAddress: addr,
        note,
        reason,
      },
      { onSuccess: onDone },
    );
  }

  const canSave = lines.length > 0 && lines.every((l) => qtyOf(l.qtyStr) > 0 && centsOf(l.priceStr) > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{t('Editing order')}</span>
        <span className="text-xs text-muted-foreground">{order.customerEmail ?? '—'}</span>
      </div>

      <ul className="space-y-2">
        {lines.map((l, idx) => (
          <li key={`${l.variantId}|${l.locationId ?? ''}`} className="rounded-xl border border-border p-3">
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
                <button type="button" onClick={() => stepQty(idx, -1)} className="grid h-8 w-8 place-items-center hover:bg-muted" aria-label={t('Decrease')}>
                  <Minus className="h-3.5 w-3.5" strokeWidth={2.5} />
                </button>
                <input
                  type="text"
                  inputMode="numeric"
                  value={l.qtyStr}
                  onChange={(e) => setQtyStr(idx, e.target.value)}
                  className="w-12 border-x border-border bg-transparent py-1.5 text-center font-mono text-sm outline-none"
                />
                <button type="button" onClick={() => stepQty(idx, 1)} className="grid h-8 w-8 place-items-center hover:bg-muted" aria-label={t('Increase')}>
                  <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                </button>
              </div>
              <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                {t('Unit price')}
                <span className="relative">
                  <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={l.priceStr}
                    onChange={(e) => setPriceStr(idx, e.target.value)}
                    aria-invalid={centsOf(l.priceStr) === 0 || undefined}
                    className={cn(
                      'w-24 rounded-lg border bg-transparent py-1.5 pl-5 pr-2 text-right font-mono text-sm outline-none focus:border-brand',
                      centsOf(l.priceStr) === 0 ? 'border-destructive' : 'border-border',
                    )}
                  />
                </span>
              </label>
              <span className="ml-auto font-mono text-sm font-semibold tabular-nums">{formatUsd(qtyOf(l.qtyStr) * centsOf(l.priceStr))}</span>
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

/** Staff cancel: pending, approved or partially approved (not shipped). Puts
 * back the stock the order took and closes its shortfalls (cancel_order). */
function AdminCancelOrder({ orderId, restoresStock }: { orderId: string; restoresStock: boolean }) {
  const { t } = useI18n();
  const cancel = useCancelOrder();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="w-full text-center text-xs font-medium text-muted-foreground underline hover:text-destructive">
        {t('Cancel order')}
      </button>
    );
  }
  return (
    <div className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs">
      <p>
        {restoresStock
          ? t('Cancel this order? The approved units go back to stock and its open shortfalls close. The customer sees the cancellation.')
          : t('Cancel this order? The customer sees the cancellation.')}
      </p>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={t('Reason (shown to the customer)')}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
      />
      {cancel.isError && <p className="text-destructive">{adminErrorMessage(t, (cancel.error as Error).message)}</p>}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="flex-1" disabled={cancel.isPending} onClick={() => setOpen(false)}>
          {t('Keep order')}
        </Button>
        <Button size="sm" variant="primary" className="flex-1" disabled={cancel.isPending} onClick={() => cancel.mutate({ orderId, reason })}>
          {cancel.isPending ? t('Cancelling…') : t('Yes, cancel')}
        </Button>
      </div>
    </div>
  );
}
