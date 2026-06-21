import { useAdminData } from '@/data/admin';
import { CATALOG } from '@/data/catalog';
import { AdminHeading } from '@/components/admin/parts';
import { tierBg } from '@/lib/tierStyles';
import { formatInt, formatUsd } from '@/lib/format';
import { cn } from '@/lib/utils';

const monthLabel = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="text-sm font-medium">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function ReportsPage() {
  const { orders, kpis } = useAdminData();

  const maxMonthly = Math.max(...kpis.monthly.map((m) => m.gmvCents), 1);
  const maxTierGmv = Math.max(...kpis.tierMix.map((t) => t.gmvCents), 1);

  const byModel = new Map<string, { units: number; gmv: number }>();
  for (const o of orders) {
    const e = byModel.get(o.model) ?? { units: 0, gmv: 0 };
    e.units += o.units;
    e.gmv += o.subtotalCents;
    byModel.set(o.model, e);
  }
  const topProducts = [...byModel.entries()]
    .map(([model, v]) => ({ model, ...v }))
    .sort((a, b) => b.units - a.units)
    .slice(0, 8);

  const supplier = { 'source-1': 0, 'source-2': 0 };
  for (const item of CATALOG) for (const s of item.stock) supplier[s.supplier] += s.availableQty;
  const supTotal = supplier['source-1'] + supplier['source-2'] || 1;
  const SUP = [
    { name: 'Assurant', units: supplier['source-1'] },
    { name: 'Mannapov LLC', units: supplier['source-2'] },
  ];

  return (
    <div className="space-y-6">
      <AdminHeading title="Reports" subtitle="Sales, supplier mix, and tier distribution — derived from the live order book." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Revenue by month">
          <div className="flex h-40 gap-2">
            {kpis.monthly.map((m) => (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex w-full flex-1 items-end" title={formatUsd(m.gmvCents, true)}>
                  <div className="w-full rounded-t bg-brand/80" style={{ height: `${Math.max(3, (m.gmvCents / maxMonthly) * 100)}%` }} />
                </div>
                <span className="font-mono text-[0.6rem] text-muted-foreground">{monthLabel(m.month)}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Inventory by supplier">
          <div className="space-y-4">
            {SUP.map((s) => (
              <div key={s.name}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{s.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatInt(s.units)} units · {Math.round((s.units / supTotal) * 100)}%
                  </span>
                </div>
                <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-brand/80" style={{ width: `${(s.units / supTotal) * 100}%` }} />
                </div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">A third Dubai wholesale feed (Gold Prime · DXB) is reserved for Phase 1.</p>
          </div>
        </Section>

        <Section title="GMV by tier">
          <div className="space-y-3.5">
            {kpis.tierMix.map((t) => (
              <div key={t.tier.code}>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className={cn('h-2 w-2 rounded-full', tierBg[t.tier.tone])} />
                    {t.tier.label}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">{formatUsd(t.gmvCents, true)}</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                  <div className={cn('h-full rounded-full', tierBg[t.tier.tone])} style={{ width: `${(t.gmvCents / maxTierGmv) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Top products by units">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              {topProducts.map((p) => (
                <tr key={p.model}>
                  <td className="py-2.5 font-medium">{p.model}</td>
                  <td className="py-2.5 text-right font-mono tabular-nums">{formatInt(p.units)}</td>
                  <td className="py-2.5 text-right font-mono tabular-nums text-muted-foreground">{formatUsd(p.gmv, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </div>
    </div>
  );
}
