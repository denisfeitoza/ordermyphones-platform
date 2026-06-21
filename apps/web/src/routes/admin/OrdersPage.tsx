import { useState } from 'react';
import { useAdminData } from '@/data/admin';
import { AdminHeading, Table, Td, OrderStatusChip } from '@/components/admin/parts';
import type { OrderStatus } from '@/store';
import { formatInt, formatUsd } from '@/lib/format';
import { cn } from '@/lib/utils';

const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const FILTERS: { key: OrderStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'reserved', label: 'Reserved' },
  { key: 'processing', label: 'Processing' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'delivered', label: 'Delivered' },
];

export default function AdminOrdersPage() {
  const { orders } = useAdminData();
  const [filter, setFilter] = useState<OrderStatus | 'all'>('all');
  const shown = filter === 'all' ? orders : orders.filter((o) => o.status === filter);

  return (
    <div className="space-y-6">
      <AdminHeading
        title="Orders"
        subtitle={`${orders.length} orders across all tenants · reserve-at-source`}
        action={
          <div className="scrollbar-hide flex gap-1 overflow-x-auto">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={cn(
                  'whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  filter === f.key ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:bg-muted',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        }
      />

      <Table
        minWidth={860}
        columns={[
          { key: 'id', label: 'Order' },
          { key: 'customer', label: 'Customer' },
          { key: 'units', label: 'Units', align: 'right' },
          { key: 'tier', label: 'Tier' },
          { key: 'total', label: 'Total', align: 'right' },
          { key: 'supplier', label: 'Held at' },
          { key: 'date', label: 'Placed' },
          { key: 'status', label: 'Status' },
        ]}
      >
        {shown.map((o) => (
          <tr key={o.id} className="transition-colors hover:bg-muted/40">
            <Td className="font-mono text-xs font-medium">{o.id}</Td>
            <Td>
              <span className="block truncate">{o.customer}</span>
              <span className="block truncate text-xs text-muted-foreground">{o.model}</span>
            </Td>
            <Td align="right" className="font-mono tabular-nums">{formatInt(o.units)}</Td>
            <Td className="text-muted-foreground">{o.tierLabel}</Td>
            <Td align="right" className="font-mono font-medium tabular-nums">{formatUsd(o.subtotalCents)}</Td>
            <Td className="truncate text-xs text-muted-foreground">{o.suppliers.join(', ')}</Td>
            <Td className="text-muted-foreground">{fmtDate(o.placedAt)}</Td>
            <Td><OrderStatusChip status={o.status} /></Td>
          </tr>
        ))}
      </Table>

      {shown.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          No orders in this status.
        </p>
      )}
    </div>
  );
}
