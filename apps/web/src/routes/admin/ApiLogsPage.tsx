import { ScrollText } from 'lucide-react';
import { useOpsStream } from '@/components/ops/useOpsStream';
import { LogStream, Panel } from '@/components/ops/OpsPanels';
import { useCatalogSource } from '@/lib/catalogSource';
import { PreviewNotice } from '@/components/admin/PreviewNotice';
import { AdminHeading, StatCard } from '@/components/admin/parts';
import { SOURCE_LABELS } from '@/data/catalog';
import { cn } from '@/lib/utils';

const WEBHOOKS: { source: string; event: string; code: number; ago: string }[] = [
  { source: 'Stripe', event: 'payment_intent.succeeded', code: 200, ago: '12s' },
  { source: SOURCE_LABELS['source-1'], event: 'inventory.delta', code: 200, ago: '1s' },
  { source: SOURCE_LABELS['source-2'], event: 'inventory.delta', code: 200, ago: '2s' },
  { source: 'AI orchestrator', event: 'price.reprice.applied', code: 200, ago: '38s' },
  { source: 'Stripe', event: 'charge.refunded', code: 200, ago: '3m' },
  { source: 'AI orchestrator', event: 'tier.promote.proposed', code: 202, ago: '1m' },
];

export default function ApiLogsPage() {
  const source = useCatalogSource();
  const { events } = useOpsStream();
  if (source === 'real') {
    return (
      <PreviewNotice
        title="API logs"
        subtitle="Webhook deliveries and integration traffic."
        icon={<ScrollText className="h-6 w-6" strokeWidth={1.75} />}
        blurb="A live feed of webhook deliveries (Stripe, supplier feeds, integrations) with status codes, latency and retries. The integrations that produce this traffic are wired incrementally — the log view turns on with them in v1.1."
        bullets={[
          'Per-event status, latency and payload',
          'Retry and replay a failed delivery',
          'Filter by source and error state',
        ]}
      />
    );
  }

  return (
    <div className="space-y-6">
      <AdminHeading title="API logs" subtitle="Supplier syncs, Stripe webhooks, and AI actions — streamed live." />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Requests / min" value="1,284" sub="rolling" live />
        <StatCard label="Avg latency" value="172ms" sub="suppliers" />
        <StatCard label="Webhook success" value="100%" accent="text-success" sub="24h" />
        <StatCard label="Errors" value="0" accent="text-success" sub="last hour" />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <LogStream events={events} />
        </div>
        <Panel title="Webhook deliveries" badge="signed">
          <div className="divide-y divide-border">
            {WEBHOOKS.map((w, i) => (
              <div key={i} className="flex items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs">{w.event}</p>
                  <p className="text-xs text-muted-foreground">{w.source} · {w.ago} ago</p>
                </div>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 font-mono text-[0.65rem] font-medium',
                    w.code < 300 ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning',
                  )}
                >
                  {w.code}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
