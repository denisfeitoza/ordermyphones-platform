import { useMemo } from 'react';
import { useAdminData } from '@/data/admin';
import { useAdminOrders, type AdminOrder } from '@/data/adminOrders';
import { CATALOG, SOURCE_LABELS } from '@/data/catalog';
import { useCatalogSource } from '@/lib/catalogSource';
import { AdminHeading } from '@/components/admin/parts';
import { DB_TIER_LABELS, type DbTier } from '@/lib/invites';
import { tierBg } from '@/lib/tierStyles';
import { formatInt, formatUsd } from '@/lib/format';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

const monthLabel = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
const TIER_TONE: Record<string, '1' | '2' | '3' | '4'> = { consumer: '1', retailer: '2', wholesale: '3', distributor: '4' };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="text-sm font-medium">{t(title)}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const { t } = useI18n();
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{t(label)}</p>
      <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

/** Real-mode analytics derived entirely from the live order book (useAdminOrders).
 * No supplier/cost data — the order snapshot carries only model, qty, tier and
 * price. Fills in as orders flow; empty state shows until the first order. */
function RealReports({ orders }: { orders: AdminOrder[] }) {
  const { t } = useI18n();
  const agg = useMemo(() => {
    const monthly = new Map<string, number>();
    const tierMix = new Map<string, number>();
    const byModel = new Map<string, { units: number; gmv: number }>();
    let gmv = 0;
    let units = 0;
    for (const o of orders) {
      gmv += o.subtotalCents;
      const month = o.placedAt.slice(0, 7);
      monthly.set(month, (monthly.get(month) ?? 0) + o.subtotalCents);
      tierMix.set(o.tier, (tierMix.get(o.tier) ?? 0) + o.subtotalCents);
      for (const l of o.lines) {
        units += l.qtyRequested;
        const model = l.name.split(' · ')[0];
        const e = byModel.get(model) ?? { units: 0, gmv: 0 };
        e.units += l.qtyRequested;
        e.gmv += l.lineTotalCents;
        byModel.set(model, e);
      }
    }
    const monthlyArr = [...monthly.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-6).map(([month, gmvCents]) => ({ month, gmvCents }));
    const tierArr = (['consumer', 'retailer', 'wholesale', 'distributor'] as DbTier[])
      .map((code) => ({ code, gmvCents: tierMix.get(code) ?? 0 }))
      .filter((t) => t.gmvCents > 0);
    const topProducts = [...byModel.entries()].map(([model, v]) => ({ model, ...v })).sort((a, b) => b.units - a.units).slice(0, 8);
    return { monthlyArr, tierArr, topProducts, gmv, units, count: orders.length };
  }, [orders]);

  if (orders.length === 0) {
    return (
      <div className="space-y-6">
        <AdminHeading title="Reports" subtitle="Sales and tier distribution — derived from the live order book." />
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          {t('No orders yet. As orders come in, revenue by month, tier mix and top products fill in here automatically.')}
        </div>
      </div>
    );
  }

  const maxMonthly = Math.max(...agg.monthlyArr.map((m) => m.gmvCents), 1);
  const maxTierGmv = Math.max(...agg.tierArr.map((t) => t.gmvCents), 1);

  return (
    <div className="space-y-6">
      <AdminHeading title="Reports" subtitle="Sales and tier distribution — derived from the live order book." />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Gross merchandise value" value={formatUsd(agg.gmv, true)} />
        <Stat label="Orders" value={formatInt(agg.count)} />
        <Stat label="Units ordered" value={formatInt(agg.units)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Revenue by month">
          <div className="flex h-40 gap-2">
            {agg.monthlyArr.map((m) => (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex w-full flex-1 items-end" title={formatUsd(m.gmvCents, true)}>
                  <div className="w-full rounded-t bg-brand/80" style={{ height: `${Math.max(3, (m.gmvCents / maxMonthly) * 100)}%` }} />
                </div>
                <span className="font-mono text-[0.6rem] text-muted-foreground">{monthLabel(m.month)}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="GMV by tier">
          <div className="space-y-3.5">
            {agg.tierArr.map((tier) => (
              <div key={tier.code}>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className={cn('h-2 w-2 rounded-full', tierBg[TIER_TONE[tier.code]])} />
                    {t(DB_TIER_LABELS[tier.code])}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">{formatUsd(tier.gmvCents, true)}</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                  <div className={cn('h-full rounded-full', tierBg[TIER_TONE[tier.code]])} style={{ width: `${(tier.gmvCents / maxTierGmv) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Top products by units">
          {agg.topProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('No line items yet.')}</p>
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {agg.topProducts.map((p) => (
                  <tr key={p.model}>
                    <td className="py-2.5 font-medium">{p.model}</td>
                    <td className="py-2.5 text-right font-mono tabular-nums">{formatInt(p.units)}</td>
                    <td className="py-2.5 text-right font-mono tabular-nums text-muted-foreground">{formatUsd(p.gmv, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section title="Coming in v1.1">
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>· {t('Date-range filters and drill-down')}</li>
            <li>· {t('CSV / XLSX export')}</li>
            <li>· {t('Margin and sell-through by location')}</li>
          </ul>
        </Section>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const { t } = useI18n();
  const source = useCatalogSource();
  const { orders, kpis } = useAdminData();
  const ordersQ = useAdminOrders();

  if (source === 'real') {
    if (ordersQ.isLoading) {
      return <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">{t('Loading reports…')}</div>;
    }
    return <RealReports orders={ordersQ.data ?? []} />;
  }

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
    { name: SOURCE_LABELS['source-1'], units: supplier['source-1'] },
    { name: SOURCE_LABELS['source-2'], units: supplier['source-2'] },
  ];

  return (
    <div className="space-y-6">
      <AdminHeading title="Reports" subtitle="Sales, inventory mix, and tier distribution — derived from the live order book." />

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

        <Section title="Inventory by location">
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
          </div>
        </Section>

        <Section title="GMV by tier">
          <div className="space-y-3.5">
            {kpis.tierMix.map((tm) => (
              <div key={tm.tier.code}>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className={cn('h-2 w-2 rounded-full', tierBg[tm.tier.tone])} />
                    {t(tm.tier.label)}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">{formatUsd(tm.gmvCents, true)}</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                  <div className={cn('h-full rounded-full', tierBg[tm.tier.tone])} style={{ width: `${(tm.gmvCents / maxTierGmv) * 100}%` }} />
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
