import { useOpenReconciliations, useResolveReconciliation } from '@/data/adminOrders';
import { AdminHeading, Panel } from '@/components/admin/parts';
import { Button } from '@/components/ui/Button';
import { formatInt } from '@/lib/format';

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/**
 * Reconciliation queue — open shortfalls from partial approvals. Fulfill
 * deducts the remaining shortfall now (if stock has arrived) and resolves (or
 * shrinks the shortfall if only partly covered); Cancel closes the row, leaving
 * the partial approval as-is. Both are audited server-side.
 */
export default function ReconciliationPage() {
  const { data: rows, isLoading, isError } = useOpenReconciliations();
  const resolve = useResolveReconciliation();
  const list = rows ?? [];

  return (
    <div className="space-y-6">
      <AdminHeading title="Reconciliation" subtitle={`${list.length} open shortfall${list.length === 1 ? '' : 's'} awaiting stock`} />

      {resolve.isError && (
        <p className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {(resolve.error as Error)?.message ?? 'Action failed.'}
        </p>
      )}

      {isError ? (
        <p className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Could not load the reconciliation queue.
        </p>
      ) : isLoading ? (
        <p className="rounded-2xl border border-border bg-card p-16 text-center text-sm text-muted-foreground">Loading…</p>
      ) : list.length === 0 ? (
        <Panel>
          <p className="py-10 text-center text-sm text-muted-foreground">No open shortfalls. Everything is reconciled.</p>
        </Panel>
      ) : (
        <div className="space-y-2">
          {list.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{r.name}</p>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                  {r.sku} · opened {fmtDate(r.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                  short {formatInt(r.shortfallQty)}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    size="md"
                    disabled={resolve.isPending}
                    onClick={() => resolve.mutate({ id: r.id, action: 'fulfill' })}
                  >
                    Fulfill
                  </Button>
                  <Button
                    variant="outline"
                    size="md"
                    disabled={resolve.isPending}
                    onClick={() => resolve.mutate({ id: r.id, action: 'cancel' })}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
