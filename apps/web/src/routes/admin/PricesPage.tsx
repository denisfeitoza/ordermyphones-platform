import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Tag, UploadCloud } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { AdminHeading, Panel, StatCard, Table, Td } from '@/components/admin/parts';
import { Button } from '@/components/ui/Button';
import { formatInt, formatUsd } from '@/lib/format';
import { tierBg, tierText } from '@/lib/tierStyles';
import { cn } from '@/lib/utils';

/**
 * Real backend tier codes (public.customer_tier) — distinct from the mock
 * data/tiers.ts `tier_1..tier_4` codes, which the storefront still uses
 * (PRICING-ENGINE.md §10 tracks that as pending frontend alignment). This
 * page reads the live `prices` / `product_variants` tables directly, so it
 * speaks the DB's own tier vocabulary.
 */
type DbTier = 'consumer' | 'retailer' | 'wholesale' | 'distributor';

const TIER_ORDER: readonly DbTier[] = ['consumer', 'retailer', 'wholesale', 'distributor'];

const TIER_META: Record<DbTier, { label: string; short: string; tone: '1' | '2' | '3' | '4' }> = {
  consumer: { label: 'Consumer', short: 'T1', tone: '1' },
  retailer: { label: 'Retailer', short: 'T2', tone: '2' },
  wholesale: { label: 'Wholesale', short: 'T3', tone: '3' },
  distributor: { label: 'Distributor', short: 'T4', tone: '4' },
};

const FLAG_LABEL: Record<string, string> = {
  margin: 'Below margin floor',
  unbenchmarked: 'No benchmark yet',
  grade_gate: 'Grade-gated (sub-A)',
  tier_order: 'Tier-order violation',
  zero_qty: 'Zero stock',
  cost_swing: 'Cost swing — held for review',
  collision: 'Multi-vendor collision',
  spread: 'Cross-location spread',
};

/** Raw shape of the nested PostgREST select — mirrors the query below by hand (no generated DB types here, same convention as InventoryPage). */
interface RawPriceRow {
  tier: DbTier;
  price_cents: number;
  visible: boolean;
  flag_reason: string | null;
  basis_cost_cents: number | null;
  source: string;
}

interface RawVariantRow {
  id: string;
  sku: string;
  grade: string;
  carrier: string;
  capacity: string;
  color: string | null;
  lock_status: string;
  product: { make: string; model: string; model_number: string } | null;
  prices: RawPriceRow[];
}

interface TierPrice {
  priceCents: number;
  visible: boolean;
  flagReason: string | null;
  source: string;
  basisCostCents: number | null;
}

interface PriceRow {
  variantId: string;
  sku: string;
  grade: string;
  carrier: string;
  capacity: string;
  color: string | null;
  lockStatus: string;
  make: string;
  model: string;
  modelNumber: string;
  /** Bare acquisition cost (not the T1/T2-kitted basis) — pulled from whichever of wholesale/distributor priced first, since T3/T4 always carry the bare cost. */
  basisCostCents: number | null;
  tiers: Partial<Record<DbTier, TierPrice>>;
}

function toPriceRow(r: RawVariantRow): PriceRow | null {
  if (!r.product) return null;
  const tiers: Partial<Record<DbTier, TierPrice>> = {};
  for (const p of r.prices) {
    tiers[p.tier] = {
      priceCents: p.price_cents,
      visible: p.visible,
      flagReason: p.flag_reason,
      source: p.source,
      basisCostCents: p.basis_cost_cents,
    };
  }
  return {
    variantId: r.id,
    sku: r.sku,
    grade: r.grade,
    carrier: r.carrier,
    capacity: r.capacity,
    color: r.color,
    lockStatus: r.lock_status,
    make: r.product.make,
    model: r.product.model,
    modelNumber: r.product.model_number,
    basisCostCents: tiers.distributor?.basisCostCents ?? tiers.wholesale?.basisCostCents ?? null,
    tiers,
  };
}

const ROW_LIMIT = 1000;

async function fetchPriceRows(): Promise<PriceRow[]> {
  const { data, error } = await supabase
    .from('product_variants')
    .select(
      `id, sku, grade, carrier, capacity, color, lock_status,
       product:products ( make, model, model_number ),
       prices ( tier, price_cents, visible, flag_reason, basis_cost_cents, source )`,
    )
    .order('sku')
    .limit(ROW_LIMIT);

  if (error) throw error;
  return ((data ?? []) as unknown as RawVariantRow[]).map(toPriceRow).filter((r): r is PriceRow => r !== null);
}

/** Inline "$__ [Set]" form — its own component so each row owns its own input state and pending status. */
function BenchmarkForm({ onSubmit, busy }: { onSubmit: (priceCents: number) => void; busy: boolean }) {
  const [value, setValue] = useState('');
  const [err, setErr] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const n = Number(value);
    if (!value.trim() || !Number.isFinite(n) || n <= 0) {
      setErr('Enter a $ amount');
      return;
    }
    setErr(null);
    onSubmit(Math.round(n * 100));
  }

  return (
    <form onSubmit={handleSubmit} className="mt-1.5 flex items-center gap-1">
      <span className="text-xs text-muted-foreground">$</span>
      <input
        type="number"
        inputMode="decimal"
        min="0.01"
        step="0.01"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          if (err) setErr(null);
        }}
        disabled={busy}
        placeholder="0.00"
        aria-label="Set consumer benchmark price"
        className="h-8 w-20 rounded-md border border-border bg-background px-2 text-xs tabular-nums outline-none transition-colors focus:ring-1 focus:ring-ring disabled:opacity-50"
      />
      <Button type="submit" variant="outline" size="sm" disabled={busy} className="h-8 px-2.5 text-[11px]">
        {busy ? 'Setting…' : 'Set'}
      </Button>
      {err && <span className="text-[10px] text-destructive">{err}</span>}
    </form>
  );
}

function TierCell({ tier, data }: { tier: DbTier; data: TierPrice | undefined }) {
  const meta = TIER_META[tier];
  if (!data) {
    return <span className="text-xs text-muted-foreground">Not priced yet</span>;
  }
  return (
    <div>
      <div className="flex items-center justify-end gap-1.5">
        <span className={cn('font-mono text-sm tabular-nums', data.visible ? tierText[meta.tone] : 'text-muted-foreground line-through decoration-1')}>
          {formatUsd(data.priceCents)}
        </span>
        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', data.visible ? tierBg[meta.tone] : 'bg-muted-foreground/40')} />
      </div>
      <p className="text-right text-[11px] text-muted-foreground">
        {data.visible ? 'Visible' : data.flagReason ? FLAG_LABEL[data.flagReason] ?? data.flagReason : 'Hidden'}
      </p>
    </div>
  );
}

export default function PricesPage() {
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();

  const query = useQuery({ queryKey: ['admin-prices'], queryFn: fetchPriceRows });
  const rows = query.data ?? [];

  const benchmarkMutation = useMutation({
    mutationFn: async ({ variantId, priceCents }: { variantId: string; priceCents: number }) => {
      const { error } = await supabase.rpc('set_consumer_benchmark', {
        p_variant_id: variantId,
        p_price_cents: priceCents,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-prices'] }),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.sku.toLowerCase().includes(q) ||
        r.model.toLowerCase().includes(q) ||
        r.make.toLowerCase().includes(q) ||
        r.modelNumber.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const capped = rows.length >= ROW_LIMIT;
  const variantCount = rows.length;
  const consumerVisible = rows.filter((r) => r.tiers.consumer?.visible).length;
  const flagged = rows.filter((r) => TIER_ORDER.some((t) => r.tiers[t]?.flagReason)).length;
  const gradeGated = rows.filter((r) => r.tiers.consumer?.flagReason === 'grade_gate').length;

  return (
    <div className="space-y-6">
      <AdminHeading
        title="Prices"
        subtitle={
          query.isSuccess
            ? `${formatInt(variantCount)} priced variant${variantCount === 1 ? '' : 's'}${capped ? ` (capped at ${formatInt(ROW_LIMIT)})` : ''} · pricing engine v2`
            : 'Consumer, retailer, wholesale and distributor prices — pricing engine v2'
        }
        action={
          <Link to="/admin/pricing-flags">
            <Button variant="outline" size="sm">
              <Tag className="h-4 w-4" strokeWidth={2} />
              Flag queue
            </Button>
          </Link>
        }
      />

      {query.isError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Could not load prices: {query.error instanceof Error ? query.error.message : 'unknown error'}
        </div>
      )}

      {query.isLoading && (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Loading prices…</div>
      )}

      {query.isSuccess && rows.length === 0 && (
        <Panel>
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Tag className="h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
            <div>
              <p className="font-medium">No prices yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Prices are computed from cost — run a Smart Stock Import first, then set a consumer benchmark here to unlock T1/T2 for eligible grades.
              </p>
            </div>
            <Link to="/admin/import">
              <Button variant="brand" size="sm" className="mt-1">
                <UploadCloud className="h-4 w-4" strokeWidth={2} />
                Go to Import
              </Button>
            </Link>
          </div>
        </Panel>
      )}

      {query.isSuccess && rows.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Variants priced" value={formatInt(variantCount)} sub={capped ? 'of loaded rows' : 'total'} />
            <StatCard label="Consumer visible" value={formatInt(consumerVisible)} sub="T1 live" live />
            <StatCard label="Grade-gated" value={formatInt(gradeGated)} sub="sub-A, T1/T2 hidden" />
            <StatCard label="With a flag" value={formatInt(flagged)} accent={flagged > 0 ? 'text-warning' : ''} sub="any tier" />
          </div>

          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={2} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search model or SKU…"
              className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm outline-none transition-colors focus:ring-1 focus:ring-ring"
            />
          </div>

          {filtered.length === 0 ? (
            <Panel>
              <p className="py-8 text-center text-sm text-muted-foreground">No variant matches "{search}".</p>
            </Panel>
          ) : (
            <Table
              minWidth={1180}
              columns={[
                { key: 'model', label: 'Model' },
                { key: 'variant', label: 'Variant' },
                { key: 'sku', label: 'SKU' },
                { key: 'cost', label: 'Basis cost', align: 'right' },
                ...TIER_ORDER.map((t): { key: string; label: string; align: 'right' } => ({
                  key: t,
                  label: `${TIER_META[t].short} ${TIER_META[t].label}`,
                  align: 'right',
                })),
              ]}
            >
              {filtered.map((r) => {
                const gateBlocked = r.tiers.consumer?.flagReason === 'grade_gate';
                return (
                  <tr key={r.variantId} className="transition-colors hover:bg-muted/40">
                    <Td className="font-medium">
                      {r.make} {r.model}
                      <span className="block text-xs font-normal text-muted-foreground">{r.modelNumber}</span>
                    </Td>
                    <Td className="text-muted-foreground">
                      {r.grade} · {r.carrier} · {r.capacity}
                      {r.color ? ` · ${r.color}` : ''} · {r.lockStatus}
                    </Td>
                    <Td className="font-mono text-xs">{r.sku}</Td>
                    <Td align="right" className="font-mono tabular-nums">
                      {r.basisCostCents === null ? '—' : formatUsd(r.basisCostCents)}
                    </Td>
                    <Td align="right">
                      <TierCell tier="consumer" data={r.tiers.consumer} />
                      {gateBlocked ? (
                        <p className="mt-1.5 text-right text-[11px] text-muted-foreground">Can't be benchmarked into visibility</p>
                      ) : (
                        <div className="flex justify-end">
                          <BenchmarkForm
                            busy={benchmarkMutation.isPending && benchmarkMutation.variables?.variantId === r.variantId}
                            onSubmit={(priceCents) => benchmarkMutation.mutate({ variantId: r.variantId, priceCents })}
                          />
                        </div>
                      )}
                    </Td>
                    <Td align="right">
                      <TierCell tier="retailer" data={r.tiers.retailer} />
                    </Td>
                    <Td align="right">
                      <TierCell tier="wholesale" data={r.tiers.wholesale} />
                    </Td>
                    <Td align="right">
                      <TierCell tier="distributor" data={r.tiers.distributor} />
                    </Td>
                  </tr>
                );
              })}
            </Table>
          )}

          {benchmarkMutation.isError && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              Could not set benchmark: {benchmarkMutation.error instanceof Error ? benchmarkMutation.error.message : 'unknown error'}
            </div>
          )}
        </>
      )}
    </div>
  );
}
