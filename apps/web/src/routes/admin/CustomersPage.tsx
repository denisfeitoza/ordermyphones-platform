import type { PricingTierCode } from '@shared/pricing';
import { useAdminData } from '@/data/admin';
import { useTier } from '@/store';
import { TIERS } from '@/data/tiers';
import { AdminHeading, Table, Td, CustomerStatusChip } from '@/components/admin/parts';
import { TierBadge } from '@/components/store/TierBadge';
import { tierBg } from '@/lib/tierStyles';
import { formatInt, formatUsd } from '@/lib/format';
import { cn } from '@/lib/utils';

const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** Inline tier assignment for the live customer — this is the tier the customer sees. */
function TierAssign() {
  const { code, tier, setTier } = useTier();
  return (
    <div className="inline-flex items-center gap-2">
      <span className={cn('h-2 w-2 shrink-0 rounded-full', tierBg[tier.tone])} />
      <div className="relative">
        <select
          value={code}
          onChange={(e) => setTier(e.target.value as PricingTierCode)}
          aria-label="Assign customer tier"
          className="cursor-pointer appearance-none rounded-full border border-border bg-background py-1 pl-3 pr-7 text-xs font-medium outline-none transition-colors hover:bg-muted focus:border-brand"
        >
          {TIERS.map((t) => (
            <option key={t.code} value={t.code}>
              {t.label}
            </option>
          ))}
        </select>
        <svg
          className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

export default function CustomersPage() {
  const { customers } = useAdminData();

  return (
    <div className="space-y-6">
      <AdminHeading
        title="Customers"
        subtitle={`${customers.length} business accounts · set the live account's tier inline (the customer sees only that tier)`}
      />
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
            <Td>{c.id === 'downtown' ? <TierAssign /> : <TierBadge tier={c.tier} />}</Td>
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
