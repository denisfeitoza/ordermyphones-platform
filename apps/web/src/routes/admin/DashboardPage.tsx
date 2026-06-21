import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { useAdminData } from '@/data/admin';
import { AgentSwarm, SupplierSyncPanel } from '@/components/ops/OpsPanels';
import { AdminHeading, StatCard, Table, Td, OrderStatusChip } from '@/components/admin/parts';
import { tierBg } from '@/lib/tierStyles';
import { formatInt, formatUsd } from '@/lib/format';
import { cn } from '@/lib/utils';

const monthLabel = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-US', { month: 'short' });

export default function DashboardPage() {
  const { orders, kpis } = useAdminData();
  const recent = orders.slice(0, 6);
  const maxMonthly = Math.max(...kpis.monthly.map((m) => m.gmvCents), 1);
  const maxTierGmv = Math.max(...kpis.tierMix.map((t) => t.gmvCents), 1);

  return (
    <div className="space-y-6">
      <AdminHeading
        title="Dashboard"
        subtitle="Marketplace-wide — live customer orders merged with every tenant."
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="GMV" value={formatUsd(kpis.gmvCents, true)} sub="all tenants" accent="text-foreground" live />
        <StatCard label="Orders" value={formatInt(kpis.orders)} sub="all-time" live />
        <StatCard label="Units moved" value={formatInt(kpis.units)} sub="devices" />
        <StatCard label="Active customers" value={formatInt(kpis.customers)} sub="with orders" />
        <StatCard label="Avg order value" value={formatUsd(kpis.aovCents, true)} sub="per order" />
        <StatCard label="Tier savings passed" value={formatUsd(kpis.savingsCents, true)} accent="text-success" sub="to customers" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3 [&>*]:min-w-0">
        {/* Revenue trend */}
        <section className="rounded-2xl border border-border bg-card p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Revenue by month</h2>
            <span className="font-mono text-xs text-muted-foreground">GMV · USD</span>
          </div>
          <div className="mt-5 flex h-40 gap-2">
            {kpis.monthly.map((m) => (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex w-full flex-1 items-end" title={formatUsd(m.gmvCents, true)}>
                  <div
                    className="w-full rounded-t bg-brand/80 transition-[height] duration-500"
                    style={{ height: `${Math.max(3, (m.gmvCents / maxMonthly) * 100)}%` }}
                  />
                </div>
                <span className="font-mono text-[0.65rem] text-muted-foreground">{monthLabel(m.month)}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Tier mix */}
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-medium">GMV by tier</h2>
          <div className="mt-5 space-y-3.5">
            {kpis.tierMix.map((t) => (
              <div key={t.tier.code}>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className={cn('h-2 w-2 rounded-full', tierBg[t.tier.tone])} />
                    {t.tier.label}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {t.orders} · {formatUsd(t.gmvCents, true)}
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                  <div className={cn('h-full rounded-full', tierBg[t.tier.tone])} style={{ width: `${(t.gmvCents / maxTierGmv) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-3 [&>*]:min-w-0">
        {/* Recent orders */}
        <section className="space-y-3 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Recent orders</h2>
            <Link to="/admin/orders" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              All orders
              <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} />
            </Link>
          </div>
          <Table
            columns={[
              { key: 'id', label: 'Order' },
              { key: 'customer', label: 'Customer' },
              { key: 'units', label: 'Units', align: 'right' },
              { key: 'total', label: 'Total', align: 'right' },
              { key: 'status', label: 'Status' },
            ]}
          >
            {recent.map((o) => (
              <tr key={o.id} className="transition-colors hover:bg-muted/40">
                <Td className="font-mono text-xs font-medium">{o.id}</Td>
                <Td>
                  <span className="block truncate">{o.customer}</span>
                  <span className="block truncate text-xs text-muted-foreground">{o.model}</span>
                </Td>
                <Td align="right" className="font-mono tabular-nums">{formatInt(o.units)}</Td>
                <Td align="right" className="font-mono font-medium tabular-nums">{formatUsd(o.subtotalCents)}</Td>
                <Td><OrderStatusChip status={o.status} /></Td>
              </tr>
            ))}
          </Table>
        </section>

        {/* Live bots */}
        <div className="space-y-6">
          <SupplierSyncPanel />
          <AgentSwarm />
        </div>
      </div>
    </div>
  );
}
