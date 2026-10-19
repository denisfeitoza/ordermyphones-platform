import { useState } from 'react';
import { Banknote, Download, Package, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { shippingLabelUrl, useMarkPaid, useMarkUnpaid, useSetOrderShipping, type AdminOrder } from '@/data/adminOrders';
import { PAYMENT_STATE_STYLE, SHIPPING_LABEL, TERMS_LABEL, paymentState } from '@/lib/payment';
import { orderValueCents } from '@/lib/orderTotals';
import { parseMoneyToCents } from '@/lib/money';
import { adminErrorMessage } from '@/lib/adminErrors';
import { formatDate, formatUsd } from '@/lib/format';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

const inputCls = 'h-11 w-full rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-brand sm:h-9';

/**
 * Payment and shipping for one order: terms, invoice/due dates, paid state
 * (staff record the ACH/wire), shipping charge, packed box and, for
 * customer-label orders, the label the buyer uploaded.
 */
export function OrderMoneyPanel({ order }: { order: AdminOrder }) {
  const { t, lang } = useI18n();
  const paid = useMarkPaid();
  const unpaid = useMarkUnpaid();
  const ship = useSetOrderShipping();
  const state = paymentState(order);
  const goods = orderValueCents(order.status, order.subtotalCents, order.lines);
  const [reference, setReference] = useState('');
  const [paidOn, setPaidOn] = useState('');
  const [charge, setCharge] = useState(order.shippingCents ? (order.shippingCents / 100).toFixed(2) : '');
  const [pkg, setPkg] = useState({
    length_in: String(order.package?.length_in ?? ''),
    width_in: String(order.package?.width_in ?? ''),
    height_in: String(order.package?.height_in ?? ''),
    weight_lb: String(order.package?.weight_lb ?? ''),
    boxes: String(order.package?.boxes ?? ''),
  });
  const [labelError, setLabelError] = useState<string | null>(null);
  const closed = ['shipped', 'cancelled', 'rejected'].includes(order.status);
  const style = PAYMENT_STATE_STYLE[state];

  function saveShipping() {
    const cents = charge.trim() === '' ? 0 : parseMoneyToCents(charge);
    if (cents === null || cents < 0) return;
    const nums = Object.fromEntries(Object.entries(pkg).filter(([, v]) => v.trim() !== '').map(([k, v]) => [k, Number(v)]));
    const valid = Object.values(nums).every((n) => Number.isFinite(n) && n > 0);
    if (!valid) return;
    ship.mutate({ orderId: order.id, shippingCents: cents, pkg: Object.keys(nums).length ? nums : null });
  }

  return (
    <div className="space-y-3 rounded-xl border border-border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-medium">
          <Banknote className="h-4 w-4 text-muted-foreground" strokeWidth={2} />
          {order.paymentTerms ? t(TERMS_LABEL[order.paymentTerms]) : t('Terms not set (older order)')}
        </span>
        <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', style.cls)}>{t(style.label)}</span>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">{t('Goods')}</dt>
        <dd className="text-right font-mono tabular-nums">{formatUsd(goods)}</dd>
        <dt className="text-muted-foreground">{t('Shipping')}</dt>
        <dd className="text-right font-mono tabular-nums">{formatUsd(order.shippingCents)}</dd>
        <dt className="font-medium">{t('Invoice total')}</dt>
        <dd className="text-right font-mono font-semibold tabular-nums">{formatUsd(goods + order.shippingCents)}</dd>
        {order.invoicedAt && (
          <>
            <dt className="text-muted-foreground">{t('Invoiced')}</dt>
            <dd className="text-right">{formatDate(order.invoicedAt, lang)}</dd>
          </>
        )}
        {order.dueAt && (
          <>
            <dt className="text-muted-foreground">{t('Due')}</dt>
            <dd className={cn('text-right', state === 'overdue' && 'font-semibold text-destructive')}>{formatDate(order.dueAt, lang)}</dd>
          </>
        )}
      </dl>

      {(state === 'unpaid' || state === 'overdue') && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 basis-32">
            <span className="mb-1 block text-xs text-muted-foreground">{t('Wire / ACH reference')}</span>
            <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} className={inputCls} />
          </label>
          <label className="basis-32">
            <span className="mb-1 block text-xs text-muted-foreground">{t('Received on')}</span>
            <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className={inputCls} />
          </label>
          <Button size="sm" variant="brand" disabled={paid.isPending} onClick={() => paid.mutate({ orderId: order.id, reference, paidOn: paidOn || null })}>
            {t('Mark as paid')}
          </Button>
        </div>
      )}
      {state === 'paid' && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {t('Paid')} {order.paidAt ? formatDate(order.paidAt, lang) : ''}
            {order.paymentReference ? ` · ${order.paymentReference}` : ''}
          </span>
          <button type="button" disabled={unpaid.isPending} onClick={() => unpaid.mutate(order.id)} className="inline-flex min-h-11 items-center gap-1 rounded-full px-2 hover:bg-muted sm:min-h-0">
            <Undo2 className="h-3.5 w-3.5" strokeWidth={2} />
            {t('Undo')}
          </button>
        </div>
      )}
      {order.status === 'cancelled' && order.paymentStatus === 'paid' && (
        <p className="text-xs text-warning">{t('This order was paid and then cancelled — refund the buyer outside the system.')}</p>
      )}

      <div className="space-y-2 border-t border-border pt-3">
        <p className="flex items-center gap-1.5 text-xs font-medium">
          <Package className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2} />
          {t(SHIPPING_LABEL[order.shippingMethod])}
          {order.shippingAccount && (
            <span className="font-mono font-normal text-muted-foreground">
              · {order.shippingAccount.carrier} {order.shippingAccount.account_number}
            </span>
          )}
        </p>
        {!closed && (
          <>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              <label className="col-span-3 sm:col-span-1">
                <span className="mb-1 block text-xs text-muted-foreground">{t('Charge (USD)')}</span>
                <input value={charge} onChange={(e) => setCharge(e.target.value)} inputMode="decimal" placeholder="0.00" disabled={order.shippingMethod !== 'omp'} className={cn(inputCls, 'font-mono')} />
              </label>
              {(['length_in', 'width_in', 'height_in', 'weight_lb', 'boxes'] as const).map((k) => (
                <label key={k}>
                  <span className="mb-1 block text-xs text-muted-foreground">{t(k === 'length_in' ? 'L (in)' : k === 'width_in' ? 'W (in)' : k === 'height_in' ? 'H (in)' : k === 'weight_lb' ? 'Weight (lb)' : 'Boxes')}</span>
                  <input value={pkg[k]} onChange={(e) => setPkg((p) => ({ ...p, [k]: e.target.value.replace(/[^\d.]/g, '') }))} inputMode="decimal" className={cn(inputCls, 'font-mono')} />
                </label>
              ))}
            </div>
            <Button size="sm" variant="outline" disabled={ship.isPending} onClick={saveShipping}>
              {order.shippingMethod === 'customer_label' && order.shippingStage === 'none' ? t('Save box and ask for the label') : t('Save shipping')}
            </Button>
          </>
        )}
        {order.shippingMethod === 'customer_label' && (
          <p className="text-xs text-muted-foreground">
            {order.shippingStage === 'none'
              ? t('Pack the order, enter the box, then the buyer is asked for the label.')
              : order.shippingStage === 'awaiting_label'
                ? t('Waiting for the buyer’s label.')
                : t('Label received.')}
          </p>
        )}
        {order.labelPath && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setLabelError(null);
              shippingLabelUrl(order.labelPath!).then((u) => window.open(u, '_blank', 'noopener'), (e: Error) => setLabelError(e.message));
            }}
          >
            <Download className="h-4 w-4" strokeWidth={2} />
            {t('Open shipping label')}
          </Button>
        )}
        {labelError && <p className="text-xs text-destructive">{labelError}</p>}
      </div>

      {(paid.isError || unpaid.isError || ship.isError) && (
        <p className="text-xs text-destructive">{adminErrorMessage(t, (paid.error ?? unpaid.error ?? ship.error)?.message)}</p>
      )}
    </div>
  );
}
