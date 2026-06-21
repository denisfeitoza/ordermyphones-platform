import { CATALOG, totalAvailable, type CatalogItem } from '@/data/catalog';
import { useSync } from '@/store';
import { AdminHeading, StatCard, Table, Td } from '@/components/admin/parts';
import { formatInt } from '@/lib/format';
import { cn } from '@/lib/utils';

function supplierQty(item: CatalogItem, supplier: 'source-1' | 'source-2'): number {
  return item.stock.find((s) => s.supplier === supplier)?.availableQty ?? 0;
}

function status(total: number): { label: string; dot: string; text: string } {
  if (total === 0) return { label: 'Out of stock', dot: 'bg-destructive', text: 'text-destructive' };
  if (total <= 20) return { label: 'Low', dot: 'bg-warning', text: 'text-warning' };
  return { label: 'Healthy', dot: 'bg-success', text: 'text-muted-foreground' };
}

export default function InventoryPage() {
  const { secondsAgo } = useSync();
  const totalUnits = CATALOG.reduce((s, i) => s + totalAvailable(i), 0);
  const low = CATALOG.filter((i) => totalAvailable(i) > 0 && totalAvailable(i) <= 20).length;
  const out = CATALOG.filter((i) => totalAvailable(i) === 0).length;

  return (
    <div className="space-y-6">
      <AdminHeading
        title="Inventory"
        subtitle={`Aggregated across Assurant & Mannapov · synced ${secondsAgo === 0 ? 'just now' : `${secondsAgo}s ago`}`}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="SKUs tracked" value={formatInt(CATALOG.length)} />
        <StatCard label="Units available" value={formatInt(totalUnits)} sub="both feeds" live />
        <StatCard label="Low stock" value={formatInt(low)} accent={low > 0 ? 'text-warning' : 'text-foreground'} sub="≤ 20 units" />
        <StatCard label="Out of stock" value={formatInt(out)} accent={out > 0 ? 'text-destructive' : 'text-foreground'} sub="all suppliers" />
      </div>

      <Table
        minWidth={760}
        columns={[
          { key: 'model', label: 'Model' },
          { key: 'condition', label: 'Condition' },
          { key: 'assurant', label: 'Assurant', align: 'right' },
          { key: 'mannapov', label: 'Mannapov', align: 'right' },
          { key: 'total', label: 'Total', align: 'right' },
          { key: 'status', label: 'Status' },
        ]}
      >
        {CATALOG.map((item) => {
          const total = totalAvailable(item);
          const st = status(total);
          return (
            <tr key={item.id} className="transition-colors hover:bg-muted/40">
              <Td className="font-medium">{item.model}</Td>
              <Td className="text-muted-foreground">{item.condition === 'cpo' ? 'Certified Pre-Owned' : 'New'}</Td>
              <Td align="right" className="font-mono tabular-nums">{formatInt(supplierQty(item, 'source-1'))}</Td>
              <Td align="right" className="font-mono tabular-nums">{formatInt(supplierQty(item, 'source-2'))}</Td>
              <Td align="right" className="font-mono font-medium tabular-nums">{formatInt(total)}</Td>
              <Td>
                <span className="inline-flex items-center gap-1.5">
                  <span className={cn('h-1.5 w-1.5 rounded-full', st.dot)} />
                  <span className={st.text}>{st.label}</span>
                </span>
              </Td>
            </tr>
          );
        })}
      </Table>
    </div>
  );
}
