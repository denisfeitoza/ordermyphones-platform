import { useAdminData } from '@/data/admin';
import { AdminHeading, Table, Td, CustomerStatusChip } from '@/components/admin/parts';
import { TierBadge } from '@/components/store/TierBadge';
import { formatInt, formatUsd } from '@/lib/format';

const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export default function CustomersPage() {
  const { customers } = useAdminData();

  return (
    <div className="space-y-6">
      <AdminHeading title="Customers" subtitle={`${customers.length} business accounts · sorted by lifetime spend`} />
      <Table
        minWidth={840}
        columns={[
          { key: 'name', label: 'Business' },
          { key: 'tier', label: 'Tier' },
          { key: 'units', label: 'Lifetime units', align: 'right' },
          { key: 'spend', label: 'Lifetime spend', align: 'right' },
          { key: 'orders', label: 'Orders', align: 'right' },
          { key: 'last', label: 'Last order' },
          { key: 'status', label: 'Status' },
        ]}
      >
        {customers.map((c) => (
          <tr key={c.id} className="transition-colors hover:bg-muted/40">
            <Td>
              <span className="font-medium">{c.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {c.contact} · {c.location}
              </span>
            </Td>
            <Td><TierBadge tier={c.tier} /></Td>
            <Td align="right" className="font-mono tabular-nums">{formatInt(c.lifetimeUnits)}</Td>
            <Td align="right" className="font-mono font-medium tabular-nums">{formatUsd(c.lifetimeSpentCents, true)}</Td>
            <Td align="right" className="font-mono tabular-nums">{c.orders}</Td>
            <Td className="text-muted-foreground">{c.lastOrderAt ? fmtDate(c.lastOrderAt) : '—'}</Td>
            <Td><CustomerStatusChip status={c.status} /></Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
