import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { useSync } from '@/store';
import { Logo } from '@/components/store/Logo';
import { PulseDot } from '@/components/store/SyncHeartbeat';
import { useOpsStream } from '@/components/ops/useOpsStream';
import {
  AgentSwarm,
  buildAlerts,
  Kpi,
  LogStream,
  OrderPipeline,
  StockAlerts,
  SupplierSyncPanel,
} from '@/components/ops/OpsPanels';
import { formatInt } from '@/lib/format';

function Clock() {
  const [t, setT] = useState(() => new Date().toLocaleTimeString('en-US', { hour12: false }));
  useEffect(() => {
    const id = setInterval(() => setT(new Date().toLocaleTimeString('en-US', { hour12: false })), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="font-mono text-sm tabular-nums text-muted-foreground">{t}</span>;
}

export default function OpsPage() {
  const { ordersReconciled, skusTracked } = useSync();
  const { events, orders, held } = useOpsStream();
  const alertCount = buildAlerts().length;

  return (
    <div className="dark min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-4">
          <Logo />
          <span className="hidden items-center gap-2 border-l border-border pl-4 text-sm text-muted-foreground sm:flex">
            <PulseDot />
            Live Operations
          </span>
          <div className="ml-auto flex items-center gap-4">
            <Clock />
            <Link
              to="/"
              className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Storefront
              <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-4 px-4 py-6">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight">Inventory bot · live operations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Aggregating Assurant &amp; Mannapov LLC every 2 seconds, cross-checking open orders, and reserving stock at
            source. Simulated for the mockup — no live supplier calls.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Kpi label="Orders reconciled" value={formatInt(ordersReconciled)} sub="last 24h" />
          <Kpi label="SKUs tracked" value={formatInt(skusTracked)} sub="across 2 feeds" />
          <Kpi label="Units held" value={formatInt(held)} sub="reserved at source" accent="text-warning" />
          <Kpi label="Sync uptime" value="99.94%" sub="30-day" accent="text-success" />
          <Kpi label="Open alerts" value={String(alertCount)} sub="stock & price" accent={alertCount > 0 ? 'text-destructive' : 'text-foreground'} />
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-3 [&>*]:min-w-0">
          <div className="lg:col-span-3">
            <OrderPipeline orders={orders} />
          </div>
          <div className="lg:col-span-2">
            <LogStream events={events} />
          </div>
          <div className="lg:col-span-1">
            <SupplierSyncPanel />
          </div>
          <div className="lg:col-span-2">
            <AgentSwarm />
          </div>
          <div className="lg:col-span-1">
            <StockAlerts />
          </div>
        </div>
      </main>
    </div>
  );
}
