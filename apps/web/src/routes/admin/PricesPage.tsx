import { CATALOG, unitPriceCents } from '@/data/catalog';
import { TIERS } from '@/data/tiers';
import { AdminHeading, Table, Td, type Column } from '@/components/admin/parts';
import { tierBg, tierText } from '@/lib/tierStyles';
import { formatUsd } from '@/lib/format';
import { cn } from '@/lib/utils';

const matrixColumns: Column[] = [
  { key: 'model', label: 'Model' },
  ...TIERS.map((t): Column => ({ key: t.code, label: t.label, align: 'right' })),
];

export default function PricesPage() {
  return (
    <div className="space-y-6">
      <AdminHeading title="Prices" subtitle="Tier rules and the price each customer tier pays per model — derived from the pricing engine." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {TIERS.map((t) => (
          <div key={t.code} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <span className={cn('h-2 w-2 rounded-full', tierBg[t.tone])} />
              <span className="text-sm font-medium">{t.label}</span>
            </div>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{t.rangeLabel}</p>
            <p className={cn('mt-0.5 text-sm font-semibold', tierText[t.tone])}>
              {t.discount > 0 ? `−${Math.round(t.discount * 100)}% off retail` : 'Retail'}
            </p>
          </div>
        ))}
      </div>

      <Table columns={matrixColumns} minWidth={720}>
        {CATALOG.map((item) => (
          <tr key={item.id} className="transition-colors hover:bg-muted/40">
            <Td className="font-medium">{item.model}</Td>
            {TIERS.map((t) => (
              <Td key={t.code} align="right" className={cn('font-mono tabular-nums', t.discount > 0 && tierText[t.tone])}>
                {formatUsd(unitPriceCents(item, t.code))}
              </Td>
            ))}
          </tr>
        ))}
      </Table>
    </div>
  );
}
