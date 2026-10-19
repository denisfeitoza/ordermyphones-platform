import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Banknote, Package, Upload } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import type { RealOrder } from '@/data/realOrders';
import { PAYMENT_STATE_STYLE, SHIPPING_LABEL, TERMS_LABEL, paymentState } from '@/lib/payment';
import { orderValueCents } from '@/lib/orderTotals';
import { formatDate, formatUsd } from '@/lib/format';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

const LABEL_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg']);

/**
 * Buyer's view of an order's money and shipping: terms, invoice total
 * (goods + shipping), due date and paid state; for "send your own label"
 * orders, the packed box and the label upload.
 */
export function OrderPaymentShipping({ order, accountId }: { order: RealOrder; accountId: string }) {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = paymentState(order);
  const goods = orderValueCents(order.status, order.subtotalCents, order.lines);
  const style = PAYMENT_STATE_STYLE[state];
  const pkg = order.package;

  async function uploadLabel(file: File) {
    setError(null);
    if (!LABEL_TYPES.has(file.type)) return setError(t('Use a PDF, PNG or JPG label.'));
    if (file.size > 5 * 1024 * 1024) return setError(t('The label must be 5 MB or smaller.'));
    setBusy(true);
    try {
      const ext = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg';
      const path = `${accountId}/${order.id}/label-${Date.now()}.${ext}`;
      const up = await supabase.storage.from('shipping-labels').upload(path, file, { contentType: file.type, upsert: false });
      if (up.error) throw new Error(up.error.message);
      const { error: rpcError } = await supabase.rpc('attach_shipping_label', { p_order_id: order.id, p_path: path });
      if (rpcError) throw new Error(rpcError.message);
      void qc.invalidateQueries({ queryKey: ['my-orders'] });
      void qc.invalidateQueries({ queryKey: ['order-events', order.id] });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Upload failed.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border p-5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 font-medium">
          <Banknote className="h-4 w-4 text-muted-foreground" strokeWidth={2} />
          {order.paymentTerms ? t(TERMS_LABEL[order.paymentTerms]) : t('Payment')}
        </h2>
        {state !== 'not_invoiced' && <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', style.cls)}>{t(style.label)}</span>}
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
        <dt className="text-muted-foreground">{t('Goods')}</dt>
        <dd className="text-right font-mono tabular-nums">{formatUsd(goods)}</dd>
        <dt className="text-muted-foreground">{t('Shipping')}</dt>
        <dd className="text-right font-mono tabular-nums">{order.shippingMethod === 'omp' && order.shippingCents === 0 && state === 'not_invoiced' ? t('added at approval') : formatUsd(order.shippingCents)}</dd>
        <dt className="font-medium">{t('Total due')}</dt>
        <dd className="text-right font-mono font-semibold tabular-nums">{formatUsd(goods + order.shippingCents)}</dd>
        {order.dueAt && (
          <>
            <dt className="text-muted-foreground">{t('Due')}</dt>
            <dd className={cn('text-right', state === 'overdue' && 'font-semibold text-destructive')}>{formatDate(order.dueAt, lang)}</dd>
          </>
        )}
      </dl>

      <div className="space-y-2 border-t border-border pt-3">
        <p className="flex items-center gap-1.5 font-medium">
          <Package className="h-4 w-4 text-muted-foreground" strokeWidth={2} />
          {t(SHIPPING_LABEL[order.shippingMethod])}
        </p>
        {order.shippingAccount && (
          <p className="font-mono text-xs text-muted-foreground">
            {order.shippingAccount.carrier} · {order.shippingAccount.account_number}
          </p>
        )}
        {order.shippingMethod === 'customer_label' && order.shippingStage === 'none' && (
          <p className="text-xs text-muted-foreground">{t('Once we pack your order you will see the box size and weight here, to buy your label.')}</p>
        )}
        {order.shippingMethod === 'customer_label' && order.shippingStage !== 'none' && pkg && (
          <p className="text-xs">
            {t('Packed')}: {pkg.boxes ?? 1} {t('box(es)')} · {pkg.length_in}×{pkg.width_in}×{pkg.height_in} in · {pkg.weight_lb} lb
          </p>
        )}
        {order.shippingMethod === 'customer_label' && order.shippingStage === 'awaiting_label' && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void uploadLabel(f);
              }}
            />
            <Button variant="brand" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" strokeWidth={2} />
              {busy ? t('Uploading…') : t('Upload shipping label')}
            </Button>
          </>
        )}
        {order.shippingStage === 'label_received' && <p className="text-xs text-success">{t('Label received — we will ship with it.')}</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </section>
  );
}
