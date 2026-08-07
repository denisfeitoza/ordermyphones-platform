import { Link } from 'react-router-dom';
import { ArrowUpRight, UploadCloud, Tag, Receipt } from 'lucide-react';
import { useAdminOrders, useOpenReconciliations } from '@/data/adminOrders';
import { useRealAdminSummary } from '@/data/adminDashboard';
import { StatusChip } from '@/routes/admin/RealOrders';
import { AdminHeading, StatCard, Table, Td } from '@/components/admin/parts';
import { formatInt, formatUsd } from '@/lib/format';

/**
 * Real-mode admin dashboard (go-live). Honest operational snapshot from live
 * tables — counts that actually move as the business runs, not synthetic KPIs.
 * A fresh system legitimately shows zeros; as imports land and customers order,
 * these fill in. Replaces the mock DashboardPage's fabricated GMV/tenant chart
 * and the fake "live bots" panels when catalog_source = 'real'.
 */
export function RealDashboard() {
  const summary = useRealAdminSummary();
  const ordersQ = useAdminOrders();
  const reconQ = useOpenReconciliations();

  const orders = ordersQ.data ?? [];
  const pending = orders.filter((o) => o.status === 'pending').length;
  const recent = orders.slice(0, 6);
  const s = summary.data;

  const unitsOf = (o: (typeof orders)[number]) => o.lines.reduce((n, l) => n + l.qtyRequested, 0);

  return (
    <div className="space-y-6">
      <AdminHeading title="Dashboard" subtitle="Live operational snapshot — real catalog, orders and stock." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="SKUs live" value={s ? formatInt(s.skusLive) : '—'} sub="priced & in stock" live />
        <StatCard label="Customers" value={s ? formatInt(s.customers) : '—'} sub="registered" />
        <StatCard label="Orders" value={formatInt(orders.length)} sub="all-time" />
        <StatCard label="Pending approval" value={formatInt(pending)} sub="awaiting staff" accent={pending > 0 ? 'text-warning' : 'text-foreground'} />
        <StatCard label="Reconciliations" value={formatInt((reconQ.data ?? []).length)} sub="open shortfalls" accent={(reconQ.data ?? []).length > 0 ? 'text-warning' : 'text-foreground'} />
        <StatCard label="Pricing flags" value={s ? formatInt(s.openFlags) : '—'} sub="need review" accent={(s?.openFlags ?? 0) > 0 ? 'text-warning' : 'text-foreground'} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3 [&>*]:min-w-0">
        <section className="space-y-3 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Recent orders</h2>
            <Link to="/admin/orders" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              All orders
              <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} />
            </Link>
          </div>
          {recent.length > 0 ? (
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
                  <Td className="font-mono text-xs font-medium">{o.id.slice(0, 8)}</Td>
                  <Td>
                    <span className="block truncate">{o.customerName ?? o.customerEmail ?? '—'}</span>
                    <span className="block truncate text-xs capitalize text-muted-foreground">{o.tier}</span>
                  </Td>
                  <Td align="right" className="font-mono tabular-nums">{formatInt(unitsOf(o))}</Td>
                  <Td align="right" className="font-mono font-medium tabular-nums">{formatUsd(o.subtotalCents)}</Td>
                  <Td><StatusChip status={o.status} /></Td>
                </tr>
              ))}
            </Table>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
              No orders yet. As customers place orders they appear here and in the approval queue.
            </div>
          )}
        </section>

        <div className="space-y-3">
          <h2 className="text-sm font-medium">Quick actions</h2>
          <div className="grid gap-3">
            <QuickLink to="/admin/import" icon={<UploadCloud className="h-4 w-4" strokeWidth={2} />} title="Import stock" sub="Upload a supplier sheet" />
            <QuickLink to="/admin/prices" icon={<Tag className="h-4 w-4" strokeWidth={2} />} title="Set prices" sub="Consumer/retailer benchmarks" />
            <QuickLink to="/admin/orders" icon={<Receipt className="h-4 w-4" strokeWidth={2} />} title="Review orders" sub="Approve & reconcile" />
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickLink({ to, icon, title, sub }: { to: string; icon: React.ReactNode; title: string; sub: string }) {
  return (
    <Link to={to} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-brand/40 hover:bg-muted/40">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand/10 text-brand">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{sub}</span>
      </span>
      <ArrowUpRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
    </Link>
  );
}
