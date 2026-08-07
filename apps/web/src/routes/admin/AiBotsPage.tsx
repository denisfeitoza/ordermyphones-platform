import { useState } from 'react';
import { Check, X, Bot } from 'lucide-react';
import { useOpsStream } from '@/components/ops/useOpsStream';
import { useCatalogSource } from '@/lib/catalogSource';
import { PreviewNotice } from '@/components/admin/PreviewNotice';
import { AgentSwarm, LogStream, OrderPipeline, Panel, StockAlerts, SupplierSyncPanel } from '@/components/ops/OpsPanels';
import { AdminHeading } from '@/components/admin/parts';
import { SOURCE_LABELS } from '@/data/catalog';
import { cn } from '@/lib/utils';

type Decision = 'approved' | 'rejected';

const PROPOSALS = [
  { id: 'p1', agent: 'pricing', title: 'Reprice iPhone 16 Pro −1.5% across tiers', detail: `${SOURCE_LABELS['source-2']} landed cost dropped $14/unit. Match to hold target margin on all 4 tiers.` },
  { id: 'p2', agent: 'tier-classifier', title: 'Promote Bright Wireless LLC → Wholesale', detail: 'Crossed 50 cumulative units this week (32 → 64). Auto-promotion proposed.' },
  { id: 'p3', agent: 'inventory-triage', title: `Shift iPhone 16 reservations to ${SOURCE_LABELS['source-2']}`, detail: `${SOURCE_LABELS['source-1']} 73 vs ${SOURCE_LABELS['source-2']} 120 units — rebalance to avoid a ${SOURCE_LABELS['source-1']} stockout.` },
  { id: 'p4', agent: 'customer-support', title: 'Send drafted reply to Coastal Cellular Co', detail: 'Refund-status question on OMP-3A9E2. Draft ready for your approval.' },
];

function AiInbox() {
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const pending = PROPOSALS.filter((p) => !decisions[p.id]).length;

  return (
    <Panel title="AI suggestions inbox" badge={`${pending} pending`}>
      <div className="divide-y divide-border">
        {PROPOSALS.map((p) => {
          const decision = decisions[p.id];
          return (
            <div key={p.id} className="flex flex-wrap items-start gap-3 px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {p.title}
                  <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[0.65rem] text-muted-foreground">{p.agent}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{p.detail}</p>
              </div>
              {decision ? (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium capitalize',
                    decision === 'approved' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {decision === 'approved' && <Check className="h-3 w-3" strokeWidth={3} />}
                  {decision}
                </span>
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDecisions((d) => ({ ...d, [p.id]: 'approved' }))}
                    className="inline-flex items-center gap-1 rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-transform active:scale-95"
                  >
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => setDecisions((d) => ({ ...d, [p.id]: 'rejected' }))}
                    className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                    Reject
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

export default function AiBotsPage() {
  const source = useCatalogSource();
  const { events, orders } = useOpsStream();
  if (source === 'real') {
    return (
      <PreviewNotice
        title="AI & bots"
        subtitle="Autonomous agents acting inside the system."
        icon={<Bot className="h-6 w-6" strokeWidth={1.75} />}
        blurb="A swarm of agents — pricing, tier-classification, inventory triage, support drafting — proposing and taking actions for you, with every action logged and reversible. This is a deliberate future milestone, scoped only once you decide to green-light it."
        bullets={[
          'Per-agent proposals you approve or reject',
          'Every native action audited and reversible',
          'Guardrails against prompt-injection and runaway loops',
        ]}
      />
    );
  }

  return (
    <div className="space-y-6">
      <AdminHeading
        title="AI & bots"
        subtitle="The agent swarm working live — syncing suppliers, reserving stock, and proposing actions for your approval."
      />

      <AiInbox />

      <OrderPipeline orders={orders} />

      <div className="grid items-start gap-6 lg:grid-cols-3 [&>*]:min-w-0">
        <div className="lg:col-span-2">
          <AgentSwarm />
        </div>
        <SupplierSyncPanel />
        <div className="lg:col-span-2">
          <LogStream events={events} />
        </div>
        <StockAlerts />
      </div>
    </div>
  );
}
