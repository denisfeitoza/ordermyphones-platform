import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useOpenReconciliations, useResolveReconciliation } from '@/data/adminOrders';
import { AdminHeading, Panel } from '@/components/admin/parts';
import { Button } from '@/components/ui/Button';
import { formatDate, formatInt } from '@/lib/format';
import { useI18n } from '@/i18n';


/**
 * Reconciliation queue — open shortfalls from partial approvals. Fulfill
 * deducts the remaining shortfall now (if stock has arrived) and resolves (or
 * shrinks the shortfall if only partly covered); Cancel closes the row, leaving
 * the partial approval as-is. Both are audited server-side.
 */
export default function ReconciliationPage() {
  const { t, lang } = useI18n();
  const { data: rows, isLoading, isError } = useOpenReconciliations();
  const resolve = useResolveReconciliation();
  const list = rows ?? [];
  const [confirmClose, setConfirmClose] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <AdminHeading title="Reconciliation" subtitle={`${list.length} ${t('open shortfalls awaiting stock')}`} />

      <div className="rounded-2xl border border-brand/20 bg-brand/5 px-4 py-3 text-sm text-muted-foreground">
        <b className="text-foreground">{t('What is this?')}</b> {t('When you approve an order the system deducts live stock. If there wasn’t enough on hand, the missing units land here as a')} <b className="text-foreground">{t('shortfall')}</b>{t('. When more stock arrives, hit')} <b className="text-foreground">{t('Fulfill')}</b> {t('to complete those units; or')} <b className="text-foreground">{t('Close shortfall')}</b> {t('to close the shortfall and leave the order partially filled. Nothing is charged — this only tracks what’s owed.')}
      </div>

      {result && (
        <p role="status" className="rounded-2xl border border-success/30 bg-success/5 px-4 py-3 text-sm">
          {result}
        </p>
      )}

      {resolve.isError && (
        <p className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {(resolve.error as Error)?.message?.includes('order_not_open')
            ? t('This order has already shipped or closed, so it can no longer take stock. Close the shortfall instead.')
            : ((resolve.error as Error)?.message ?? t('Action failed.'))}
        </p>
      )}

      {isError ? (
        <p className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {t('Could not load the reconciliation queue.')}
        </p>
      ) : isLoading ? (
        <p className="rounded-2xl border border-border bg-card p-16 text-center text-sm text-muted-foreground">{t('Loading…')}</p>
      ) : list.length === 0 ? (
        <Panel>
          <p className="py-10 text-center text-sm text-muted-foreground">{t('No open shortfalls. Everything is reconciled.')}</p>
        </Panel>
      ) : (
        <div className="space-y-2">
          {list.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{r.name}</p>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                  {r.sku} · {t('opened')} {formatDate(r.createdAt, lang)}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {r.orderId && (
                    <Link to="/admin/orders" className="font-mono hover:underline">
                      {r.orderId.slice(0, 8).toUpperCase()}
                    </Link>
                  )}
                  {r.customer && <> · {r.customer}</>}
                  {' · '}
                  <span className={r.onHand > 0 ? 'text-success' : ''}>
                    {formatInt(r.onHand)} {t('on hand')}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                  {t('short')} {formatInt(r.shortfallQty)}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    size="md"
                    disabled={resolve.isPending || r.onHand === 0 || r.orderStatus === 'shipped'}
                    title={r.onHand === 0 ? t('No stock on hand for this item yet') : t('Ship the missing units now that stock has arrived')}
                    onClick={() =>
                      resolve.mutate(
                        { id: r.id, action: 'fulfill' },
                        { onSuccess: (d) => setResult(`${r.sku}: ${t('fulfilled')} ${d.deducted}, ${t('still short')} ${d.remaining_shortfall}`) },
                      )
                    }
                  >
                    {t('Fulfill')}
                  </Button>
                  {confirmClose === r.id ? (
                    <Button
                      variant="outline"
                      size="md"
                      disabled={resolve.isPending}
                      onClick={() =>
                        resolve.mutate(
                          { id: r.id, action: 'cancel' },
                          { onSuccess: () => { setConfirmClose(null); setResult(`${r.sku}: ${t('shortfall closed')}`); } },
                        )
                      }
                    >
                      {t('Confirm close')}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="md"
                      disabled={resolve.isPending}
                      title={t('Close it — the order stays partially filled')}
                      onClick={() => setConfirmClose(r.id)}
                    >
                      {t('Close shortfall')}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
