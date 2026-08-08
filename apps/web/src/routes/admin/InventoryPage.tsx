import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Download, PackageSearch, UploadCloud } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { AdminHeading, Panel, StatCard, Table, Td } from '@/components/admin/parts';
import { Button } from '@/components/ui/Button';
import { formatInt, formatUsd } from '@/lib/format';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { downloadCanonicalExport } from '@/lib/canonicalExport';

/** Raw shape of the nested PostgREST select — supabase-js has no generated Database types here, so this mirrors the query below by hand. */
interface RawInventoryRow {
  id: string;
  qty: number;
  qty_is_floor: boolean;
  unit_cost_cents: number | null;
  currency: string;
  as_of: string;
  variant: {
    sku: string;
    grade: string;
    carrier: string;
    capacity: string;
    color: string | null;
    lock_status: string;
    product: { make: string; model: string; model_number: string } | null;
  } | null;
  location: {
    code: string;
    display_name: string;
    supplier: { anon_label: string } | null;
  } | null;
}

export interface InventoryRow {
  id: string;
  qty: number;
  qtyIsFloor: boolean;
  unitCostCents: number | null;
  asOf: string;
  sku: string;
  grade: string;
  carrier: string;
  capacity: string;
  color: string | null;
  lockStatus: string;
  make: string;
  model: string;
  modelNumber: string;
  locationCode: string;
  locationName: string;
  supplierLabel: string | null;
}

/** Rows whose base entities (variant/location) were somehow deleted out from under an inventory row are dropped rather than crashing the page — orphaned rows are a data-integrity bug to fix server-side, not a reason to blank the whole screen. */
function toInventoryRow(r: RawInventoryRow): InventoryRow | null {
  if (!r.variant || !r.location || !r.variant.product) return null;
  return {
    id: r.id,
    qty: r.qty,
    qtyIsFloor: r.qty_is_floor,
    unitCostCents: r.unit_cost_cents,
    asOf: r.as_of,
    sku: r.variant.sku,
    grade: r.variant.grade,
    carrier: r.variant.carrier,
    capacity: r.variant.capacity,
    color: r.variant.color,
    lockStatus: r.variant.lock_status,
    make: r.variant.product.make,
    model: r.variant.product.model,
    modelNumber: r.variant.product.model_number,
    locationCode: r.location.code,
    locationName: r.location.display_name,
    supplierLabel: r.location.supplier?.anon_label ?? null,
  };
}

const ROW_LIMIT = 1000;

async function fetchInventory(): Promise<InventoryRow[]> {
  const { data, error } = await supabase
    .from('inventory')
    .select(
      `id, qty, qty_is_floor, unit_cost_cents, currency, as_of,
       variant:product_variants ( sku, grade, carrier, capacity, color, lock_status,
         product:products ( make, model, model_number ) ),
       location:stock_locations ( code, display_name, supplier:suppliers ( anon_label ) )`,
    )
    // A single import sets as_of = now() for every touched row, so ties are
    // common — order by id too, or the ROW_LIMIT cutoff lands at an
    // arbitrary point inside one import's rows instead of a stable cut.
    .order('as_of', { ascending: false })
    .order('id', { ascending: false })
    .limit(ROW_LIMIT);

  if (error) throw error;
  return ((data ?? []) as unknown as RawInventoryRow[]).map(toInventoryRow).filter((r): r is InventoryRow => r !== null);
}

function formatAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function status(qty: number): { label: string; dot: string; text: string } {
  if (qty === 0) return { label: 'Out of stock', dot: 'bg-destructive', text: 'text-destructive' };
  if (qty <= 20) return { label: 'Low', dot: 'bg-warning', text: 'text-warning' };
  return { label: 'Healthy', dot: 'bg-success', text: 'text-muted-foreground' };
}

/** Admin/staff-only canonical export (PRODUCT-CATALOG-STANDARD.md §8) — the
 * full internal inventory including cost/warehouse/carrier_raw/grade, in
 * the exact column order the import synonym dictionary recognizes, so
 * export → edit → re-import an unmodified file is a no-op. This page is
 * already gated to admin/staff by the /admin route's <RequireAuth
 * roles={['admin','staff']}> wrapper (App.tsx) — no extra role check here. */
function ExportMenu() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const mutation = useMutation({
    mutationFn: (format: 'csv' | 'xlsx') => downloadCanonicalExport(format),
    onSuccess: () => setOpen(false),
  });

  return (
    <div className="relative">
      <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)} disabled={mutation.isPending}>
        <Download className="h-4 w-4" strokeWidth={2} />
        {mutation.isPending ? t('Exporting…') : t('Export')}
      </Button>
      {open && (
        <>
          <button
            type="button"
            aria-label={t('Close export menu')}
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-20 mt-2 w-40 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
            {(['csv', 'xlsx'] as const).map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => mutation.mutate(fmt)}
                className="block w-full px-4 py-2.5 text-left text-sm hover:bg-muted"
              >
                {fmt.toUpperCase()}
              </button>
            ))}
          </div>
        </>
      )}
      {mutation.isError && (
        <p className="absolute right-0 top-full mt-1 w-56 text-right text-xs text-destructive">
          {t('Export failed')}: {mutation.error instanceof Error ? mutation.error.message : t('unknown error')}
        </p>
      )}
    </div>
  );
}

export default function InventoryPage() {
  const { t } = useI18n();
  const query = useQuery({ queryKey: ['admin-inventory'], queryFn: fetchInventory });
  const rows = query.data ?? [];

  const capped = rows.length >= ROW_LIMIT;
  const skuCount = new Set(rows.map((r) => r.sku)).size;
  const totalUnits = rows.reduce((s, r) => s + r.qty, 0);
  const low = rows.filter((r) => r.qty > 0 && r.qty <= 20).length;
  const out = rows.filter((r) => r.qty === 0).length;
  // Every stat below is computed over `rows`, which is capped at ROW_LIMIT —
  // once an operator's inventory exceeds that, these read as "of the loaded
  // page", not a true grand total. Label them honestly rather than silently
  // under-reporting.
  const capSuffix = capped ? ` ${t('(of loaded rows)')}` : '';

  return (
    <div className="space-y-6">
      <AdminHeading
        title="Inventory"
        subtitle={
          query.isSuccess
            ? `${formatInt(rows.length)} ${t('location balances')}${rows.length >= ROW_LIMIT ? ` (${t('capped at')} ${formatInt(ROW_LIMIT)})` : ''} · ${t('from stock imports')}`
            : t('From stock imports')
        }
        action={
          <div className="flex items-center gap-2">
            <ExportMenu />
            <Link to="/admin/import">
              <Button variant="outline" size="sm">
                <UploadCloud className="h-4 w-4" strokeWidth={2} />
                {t('Run import')}
              </Button>
            </Link>
          </div>
        }
      />

      {query.isError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {t('Could not load inventory')}: {query.error instanceof Error ? query.error.message : t('unknown error')}
        </div>
      )}

      {query.isLoading && (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">{t('Loading inventory…')}</div>
      )}

      {query.isSuccess && rows.length === 0 && (
        <Panel>
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <PackageSearch className="h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
            <div>
              <p className="font-medium">{t('No inventory yet')}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t('Run a Smart Stock Import to populate real balances — this screen shows exactly what the last import wrote, per location.')}</p>
            </div>
            <Link to="/admin/import">
              <Button variant="brand" size="sm" className="mt-1">
                <UploadCloud className="h-4 w-4" strokeWidth={2} />
                {t('Go to Import')}
              </Button>
            </Link>
          </div>
        </Panel>
      )}

      {query.isSuccess && rows.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label={t('SKUs tracked')} value={formatInt(skuCount)} sub={capped ? t('of loaded rows') : ''} />
            <StatCard label={t('Units available')} value={formatInt(totalUnits)} sub={`${t('all locations')}${capSuffix}`} live />
            <StatCard label={t('Low stock')} value={formatInt(low)} accent={low > 0 ? 'text-warning' : ''} sub={`${t('≤ 20 units')}${capSuffix}`} />
            <StatCard label={t('Out of stock')} value={formatInt(out)} accent={out > 0 ? 'text-destructive' : ''} sub={`${t('this location')}${capSuffix}`} />
          </div>

          <Table
            minWidth={960}
            columns={[
              { key: 'model', label: t('Model') },
              { key: 'variant', label: t('Variant') },
              { key: 'sku', label: t('SKU') },
              { key: 'location', label: t('Location') },
              { key: 'source', label: t('Source') },
              { key: 'qty', label: t('Qty'), align: 'right' },
              { key: 'cost', label: t('Unit cost'), align: 'right' },
              { key: 'age', label: t('As of') },
              { key: 'status', label: t('Status') },
            ]}
          >
            {rows.map((r) => {
              const st = status(r.qty);
              return (
                <tr key={r.id} className="transition-colors hover:bg-muted/40">
                  <Td className="font-medium">
                    {r.make} {r.model}
                    <span className="block text-xs font-normal text-muted-foreground">{r.modelNumber}</span>
                  </Td>
                  <Td className="text-muted-foreground">
                    {r.grade} · {r.carrier} · {r.capacity}
                    {r.color ? ` · ${r.color}` : ''} · {r.lockStatus}
                  </Td>
                  <Td className="font-mono text-xs">{r.sku}</Td>
                  <Td>{r.locationName}</Td>
                  <Td className="text-muted-foreground">{r.supplierLabel ?? '—'}</Td>
                  <Td align="right" className="font-mono tabular-nums">
                    {formatInt(r.qty)}
                    {r.qtyIsFloor ? '+' : ''}
                  </Td>
                  <Td align="right" className="font-mono tabular-nums">{r.unitCostCents === null ? '—' : formatUsd(r.unitCostCents)}</Td>
                  <Td className="text-xs text-muted-foreground">{t(formatAge(r.asOf))}</Td>
                  <Td>
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <span className={cn('h-1.5 w-1.5 rounded-full', st.dot)} />
                      <span className={st.text}>{t(st.label)}</span>
                    </span>
                  </Td>
                </tr>
              );
            })}
          </Table>
        </>
      )}
    </div>
  );
}
