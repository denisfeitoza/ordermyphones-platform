import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CATALOG, SUPPLIER_NAMES, totalAvailable } from '@/data/catalog';
import { useSync } from '@/store';
import { PulseDot } from '@/components/store/SyncHeartbeat';
import { ORDER_STAGES, type LiveOrder, type LogEvent, type LogKind } from './useOpsStream';
import { cn } from '@/lib/utils';

export function Panel({
  title,
  badge,
  className,
  children,
}: {
  title: string;
  badge?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn('flex flex-col overflow-hidden rounded-2xl border border-border bg-card', className)}>
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-medium">{title}</h3>
        {badge && (
          <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[0.65rem] text-muted-foreground">{badge}</span>
        )}
      </header>
      <div className="flex-1">{children}</div>
    </section>
  );
}

export function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('mt-1 font-mono text-2xl font-semibold tabular-nums', accent)}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function SupplierSyncPanel() {
  const { suppliers, secondsAgo } = useSync();
  const last = secondsAgo === 0 ? 'just now' : `${secondsAgo}s ago`;
  return (
    <Panel title="Supplier sync" badge="every 2s">
      <div className="divide-y divide-border">
        {suppliers.map((s) => (
          <div key={s.code} className="px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium">
                <PulseDot status={s.status} />
                {s.name}
              </span>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">{s.latencyMs}ms</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn('h-full rounded-full', s.status === 'online' ? 'bg-success' : 'bg-warning')}
                style={{ width: `${Math.min(100, (s.latencyMs / 400) * 100)}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {s.status === 'online' ? 'Online' : 'Degraded · retrying'} · synced {last}
            </p>
          </div>
        ))}
        <div className="px-4 py-3 opacity-60">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-medium">
              <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
              Gold Prime · DXB
            </span>
            <span className="font-mono text-[0.65rem] text-muted-foreground">reserved</span>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">Dubai wholesale feed — named in Phase 1 supplier audit</p>
        </div>
      </div>
    </Panel>
  );
}

const STAGE_TONE = ['border-border bg-muted/30', 'border-border bg-muted/30', 'border-warning/40 bg-warning/5', 'border-brand/40 bg-brand/5', 'border-success/40 bg-success/5'];

export function OrderPipeline({ orders }: { orders: LiveOrder[] }) {
  return (
    <Panel title="Order pipeline" badge="reserve-at-source">
      <div className="overflow-x-auto p-4">
        <div className="grid min-w-[640px] grid-cols-5 gap-2">
          {ORDER_STAGES.map((stage, idx) => {
            const inStage = orders.filter((o) => o.stage === idx);
            return (
              <div key={stage} className="min-w-0">
                <div className="mb-2 flex items-center justify-between gap-1">
                  <span className="truncate text-[0.65rem] uppercase tracking-wide text-muted-foreground">{stage}</span>
                  <span className="font-mono text-[0.65rem] text-muted-foreground">{inStage.length}</span>
                </div>
                <div className="space-y-1.5">
                  <AnimatePresence mode="popLayout">
                    {inStage.map((o) => (
                      <motion.div
                        key={o.id}
                        layout
                        layoutId={o.id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                        className={cn('rounded-lg border p-2', STAGE_TONE[idx])}
                      >
                        <p className="truncate font-mono text-[0.7rem] font-semibold">{o.id}</p>
                        <p className="truncate text-[0.7rem] text-muted-foreground">{o.model}</p>
                        <p className="font-mono text-[0.7rem] text-muted-foreground">×{o.qty} · {o.tierLabel}</p>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

const KIND_TAG: Record<LogKind, { tag: string; cls: string }> = {
  sync: { tag: 'SYNC', cls: 'text-brand' },
  cross: { tag: 'XCHK', cls: 'text-muted-foreground' },
  reserve: { tag: 'HOLD', cls: 'text-warning' },
  dispatch: { tag: 'SHIP', cls: 'text-success' },
  price: { tag: 'PRICE', cls: 'text-brand-2' },
};

export function LogStream({ events }: { events: LogEvent[] }) {
  return (
    <Panel title="API log stream" badge="live">
      <div className="scrollbar-hide h-[280px] overflow-y-auto p-3 font-mono text-xs">
        <AnimatePresence initial={false}>
          {events.map((e) => (
            <motion.div
              key={e.id}
              layout
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="flex items-center gap-2 px-1 py-1"
            >
              <span className="shrink-0 tabular-nums text-muted-foreground/70">{e.time}</span>
              <span className={cn('w-11 shrink-0 font-semibold', KIND_TAG[e.kind].cls)}>{KIND_TAG[e.kind].tag}</span>
              <span className="min-w-0 flex-1 truncate text-foreground/85">{e.text}</span>
              {e.ms !== null && <span className="shrink-0 tabular-nums text-muted-foreground/60">{e.ms}ms</span>}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Panel>
  );
}

interface Alert {
  id: string;
  model: string;
  sev: 'high' | 'med' | 'low';
  msg: string;
}

export function buildAlerts(): Alert[] {
  return CATALOG.flatMap((item): Alert[] => {
    const total = totalAvailable(item);
    if (total === 0) return [{ id: item.id, model: item.model, sev: 'high', msg: 'Out of stock — all suppliers' }];
    const zero = item.stock.find((s) => s.availableQty === 0);
    if (zero) return [{ id: item.id, model: item.model, sev: 'med', msg: `0 at ${SUPPLIER_NAMES[zero.supplier]} · rebalance` }];
    if (total <= 20) return [{ id: item.id, model: item.model, sev: 'low', msg: `${total} units left · reorder soon` }];
    return [];
  });
}

const SEV_DOT: Record<Alert['sev'], string> = { high: 'bg-destructive', med: 'bg-warning', low: 'bg-muted-foreground/50' };

export function StockAlerts() {
  const alerts = buildAlerts();
  return (
    <Panel title="Stock alerts" badge={`${alerts.length}`}>
      <div className="divide-y divide-border">
        {alerts.map((a) => (
          <div key={a.id} className="flex items-start gap-2.5 px-4 py-3">
            <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', SEV_DOT[a.sev])} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{a.model}</p>
              <p className="text-xs text-muted-foreground">{a.msg}</p>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

const AGENTS = [
  { name: 'orchestrator', role: 'Routes each intent to the right agent', last: 'Dispatched 3 actions this minute' },
  { name: 'inventory-triage', role: 'Flags stock discrepancies across feeds', last: 'Flagged 2 price gaps · Mannapov vs Assurant' },
  { name: 'pricing', role: 'Re-derives tier prices on cost change', last: 'Refreshed 4 tiers · iPhone 16 Pro' },
  { name: 'tier-classifier', role: 'Promotes accounts by cumulative volume', last: 'Promoted 1 account → Multi-Store' },
  { name: 'customer-support', role: 'Drafts replies for admin approval', last: 'Drafted 3 replies · awaiting approval' },
];

export function AgentSwarm() {
  const { pulse } = useSync();
  return (
    <Panel title="Agent swarm" badge="Agent SDK">
      <div className="divide-y divide-border">
        {AGENTS.map((a, i) => {
          const working = (pulse + i) % 3 !== 0;
          return (
            <div key={a.name} className="flex items-start gap-2.5 px-4 py-3">
              <span className="mt-1">{working ? <PulseDot /> : <span className="block h-2 w-2 rounded-full bg-muted-foreground/40" />}</span>
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm">
                  <span className="font-mono font-medium">{a.name}</span>
                  <span className={cn('text-[0.65rem]', working ? 'text-success' : 'text-muted-foreground')}>
                    {working ? 'working' : 'idle'}
                  </span>
                </p>
                <p className="truncate text-xs text-muted-foreground">{a.last}</p>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
