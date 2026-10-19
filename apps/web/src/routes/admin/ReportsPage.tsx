import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAdminData } from '@/data/admin';
import { useAdminOrders, type AdminOrder } from '@/data/adminOrders';
import { getAppSetting, setAppSetting } from '@/data/adminConfig';
import { useAuth } from '@/store';
import { CATALOG, SOURCE_LABELS } from '@/data/catalog';
import { useCatalogSource } from '@/lib/catalogSource';
import { AdminHeading } from '@/components/admin/parts';
import { DB_TIER_LABELS, type DbTier } from '@/lib/invites';
import { tierBg } from '@/lib/tierStyles';
import { formatInt, formatUsd, LOCALE_FOR } from '@/lib/format';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { orderValueCents } from '@/lib/orderTotals';
import { supabase } from '@/lib/supabase';

const monthLabel = (m: string, lang: 'en' | 'pt' | 'es' = 'en') =>
  new Date(`${m}-01T00:00:00`).toLocaleDateString(LOCALE_FOR[lang], { month: 'short', year: '2-digit' });
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

const REPORTS_INCLUDE_TEST_KEY = 'reports_include_test';

/** Mirrors `app_settings.reports_include_test` (Phase 8): rehearsal orders
 * (`orders.is_test`, snapshotted from the profile at place_order) stay out of
 * the numbers unless an admin flips the switch. Same predicate as the
 * `orders_reportable` view, applied client-side on the already-fetched book. */
function useReportsIncludeTest() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['app_settings', REPORTS_INCLUDE_TEST_KEY],
    queryFn: () => getAppSetting<boolean>(REPORTS_INCLUDE_TEST_KEY, false),
  });
  const m = useMutation({
    mutationFn: (next: boolean) => setAppSetting(REPORTS_INCLUDE_TEST_KEY, next),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['app_settings', REPORTS_INCLUDE_TEST_KEY] }),
  });
  return { includeTest: q.data === true, setIncludeTest: (v: boolean) => m.mutate(v), pending: m.isPending };
}

function TestOrdersToggle({ hidden }: { hidden: number }) {
  const { t } = useI18n();
  const { role } = useAuth();
  const { includeTest, setIncludeTest, pending } = useReportsIncludeTest();
  const canFlip = role === 'admin';
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-sm">
      <p className="text-muted-foreground">
        {includeTest
          ? t('Including rehearsal (TEST) orders in every figure below.')
          : hidden > 0
            ? `${formatInt(hidden)} ${t('rehearsal (TEST) orders hidden from the figures below.')}`
            : t('Rehearsal (TEST) orders are excluded from the figures below.')}
      </p>
      {canFlip && (
        <label className="inline-flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4 accent-brand"
            checked={includeTest}
            disabled={pending}
            onChange={(e) => setIncludeTest(e.target.checked)}
          />
          <span>{t('Include test orders')}</span>
        </label>
      )}
    </div>
  );
}

interface MarginRow {
  model: string;
  units: number;
  revenue_cents: number;
  costed_revenue_cents: number;
  cost_cents: number;
  estimated_units: number;
  uncosted_units: number;
}

/** Margin by model (RPC margin_by_model): revenue minus the unit cost recorded
 * when stock left for each sold order. Units with no known cost are listed but
 * kept out of the margin, so the % is never inflated by a missing cost. */
function MarginByModel({ includeTest }: { includeTest: boolean }) {
  const { t } = useI18n();
  const q = useQuery({
    queryKey: ['margin-by-model', includeTest],
    queryFn: async (): Promise<MarginRow[]> => {
      const { data, error } = await supabase.rpc('margin_by_model', { p_include_test: includeTest });
      if (error) throw new Error(error.message);
      return ((data ?? []) as MarginRow[]).map((r) => ({
        ...r,
        units: Number(r.units),
        revenue_cents: Number(r.revenue_cents),
        costed_revenue_cents: Number(r.costed_revenue_cents),
        cost_cents: Number(r.cost_cents),
        estimated_units: Number(r.estimated_units),
        uncosted_units: Number(r.uncosted_units),
      }));
    },
  });
  const rows = q.data ?? [];
  const tot = rows.reduce(
    (a, r) => ({ rev: a.rev + r.costed_revenue_cents, cost: a.cost + r.cost_cents, est: a.est + r.estimated_units, unc: a.unc + r.uncosted_units }),
    { rev: 0, cost: 0, est: 0, unc: 0 },
  );
  const pct = (rev: number, cost: number) => (rev > 0 ? `${(((rev - cost) / rev) * 100).toFixed(1)}%` : '—');

  return (
    <Section title="Margin by model">
      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">{t('Loading…')}</p>
      ) : q.isError ? (
        <p className="text-sm text-destructive">{t('Could not load the margin report.')}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('No sold orders yet.')}</p>
      ) : (
        <div className="space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-2 font-medium">{t('Model')}</th>
                  <th className="py-2 text-right font-medium">{t('Units')}</th>
                  <th className="py-2 text-right font-medium">{t('Revenue')}</th>
                  <th className="py-2 text-right font-medium">{t('Cost')}</th>
                  <th className="py-2 text-right font-medium">{t('Margin')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.model}>
                    <td className="py-2.5 font-medium">{r.model}</td>
                    <td className="py-2.5 text-right font-mono tabular-nums">{formatInt(r.units)}</td>
                    <td className="py-2.5 text-right font-mono tabular-nums">{formatUsd(r.revenue_cents, true)}</td>
                    <td className="py-2.5 text-right font-mono tabular-nums text-muted-foreground">{formatUsd(r.cost_cents, true)}</td>
                    <td className={cn('py-2.5 text-right font-mono tabular-nums', r.costed_revenue_cents - r.cost_cents < 0 && 'text-destructive')}>
                      {formatUsd(r.costed_revenue_cents - r.cost_cents, true)}
                      <span className="ml-1.5 text-xs text-muted-foreground">{pct(r.costed_revenue_cents, r.cost_cents)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border font-medium">
                  <td className="py-2.5">{t('Total')}</td>
                  <td />
                  <td />
                  <td className="py-2.5 text-right font-mono tabular-nums text-muted-foreground">{formatUsd(tot.cost, true)}</td>
                  <td className={cn('py-2.5 text-right font-mono tabular-nums', tot.rev - tot.cost < 0 && 'text-destructive')}>
                    {formatUsd(tot.rev - tot.cost, true)}
                    <span className="ml-1.5 text-xs text-muted-foreground">{pct(tot.rev, tot.cost)}</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          {(tot.est > 0 || tot.unc > 0) && (
            <p className="text-xs text-muted-foreground">
              {tot.est > 0 && `${formatInt(tot.est)} ${t('units use today’s cost (approved before cost tracking).')} `}
              {tot.unc > 0 && `${formatInt(tot.unc)} ${t('units have no known cost and are left out of the margin.')}`}
            </p>
          )}
        </div>
      )}
    </Section>
  );
}

/** Real-mode analytics derived entirely from the live order book (useAdminOrders).
 * Sales figures come from the order snapshot (model, qty, tier, price); the
 * margin section reads costs server-side (margin_by_model). Fills in as orders
 * flow; empty state shows until the first order. */
function RealReports({ orders: allOrders }: { orders: AdminOrder[] }) {
  const { t, lang } = useI18n();
  const { includeTest } = useReportsIncludeTest();
  const orders = useMemo(() => (includeTest ? allOrders : allOrders.filter((o) => !o.isTest)), [allOrders, includeTest]);
  const hiddenCount = allOrders.length - orders.length;
  const agg = useMemo(() => {
    const monthly = new Map<string, number>();
    const tierMix = new Map<string, number>();
    const byModel = new Map<string, { units: number; gmv: number }>();
    let gmv = 0;
    let units = 0;
    let counted = 0;
    // Revenue = approved/partially approved/shipped orders at their approved
    // units; pending, rejected and cancelled orders are not sales.
    for (const o of orders) {
      if (!['approved', 'partially_approved', 'shipped'].includes(o.status)) continue;
      const value = orderValueCents(o.status, o.subtotalCents, o.lines);
      counted += 1;
      gmv += value;
      const month = o.placedAt.slice(0, 7);
      monthly.set(month, (monthly.get(month) ?? 0) + value);
      tierMix.set(o.tier, (tierMix.get(o.tier) ?? 0) + value);
      for (const l of o.lines) {
        const q = l.qtyApproved ?? 0;
        units += q;
        const model = l.name.split(' · ')[0];
        const e = byModel.get(model) ?? { units: 0, gmv: 0 };
        e.units += q;
        e.gmv += q * l.unitPriceCents;
        byModel.set(model, e);
      }
    }
    const monthlyArr = [...monthly.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-6).map(([month, gmvCents]) => ({ month, gmvCents }));
    const tierArr = (['consumer', 'retailer', 'wholesale', 'distributor'] as DbTier[])
      .map((code) => ({ code, gmvCents: tierMix.get(code) ?? 0 }))
      .filter((t) => t.gmvCents > 0);
    const topProducts = [...byModel.entries()].map(([model, v]) => ({ model, ...v })).sort((a, b) => b.units - a.units).slice(0, 8);
    return { monthlyArr, tierArr, topProducts, gmv, units, count: counted };
  }, [orders]);

  if (orders.length === 0) {
    return (
      <div className="space-y-6">
        <AdminHeading title="Reports" subtitle="Sales and tier distribution — derived from the live order book." />
        <TestOrdersToggle hidden={hiddenCount} />
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
      <TestOrdersToggle hidden={hiddenCount} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Gross merchandise value" value={formatUsd(agg.gmv, true)} />
        <Stat label="Orders" value={formatInt(agg.count)} />
        <Stat label="Units sold" value={formatInt(agg.units)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Section title="Revenue by month">
          <div className="flex h-40 gap-2">
            {agg.monthlyArr.map((m) => (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex w-full flex-1 items-end" title={formatUsd(m.gmvCents, true)}>
                  <div className="w-full rounded-t bg-brand/80" style={{ height: `${Math.max(3, (m.gmvCents / maxMonthly) * 100)}%` }} />
                </div>
                <span className="font-mono text-[0.6rem] text-muted-foreground">{monthLabel(m.month, lang)}</span>
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

        <MarginByModel includeTest={includeTest} />

        <Section title="Coming in v1.1">
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>· {t('Date-range filters and drill-down')}</li>
            <li>· {t('CSV / XLSX export')}</li>
            <li>· {t('Sell-through by location')}</li>
          </ul>
        </Section>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const source = useCatalogSource();
  return source === 'real' ? <RealReportsLoader /> : <MockReports />;
}

function RealReportsLoader() {
  const { t } = useI18n();
  const ordersQ = useAdminOrders();
  if (ordersQ.isLoading) {
    return <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">{t('Loading reports…')}</div>;
  }
  return <RealReports orders={ordersQ.data ?? []} />;
}

/** Demo-catalog reports. Its own component so neither path pays for the other's data. */
function MockReports() {
  const { t } = useI18n();
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
    { name: SOURCE_LABELS['source-1'], units: supplier['source-1'] },
    { name: SOURCE_LABELS['source-2'], units: supplier['source-2'] },
  ];

  return (
    <div className="space-y-6">
      <AdminHeading title="Reports" subtitle="Sales, inventory mix, and tier distribution — derived from the live order book." />

      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
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
