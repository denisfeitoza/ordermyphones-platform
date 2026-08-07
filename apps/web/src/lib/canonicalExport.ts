import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import { fetchAllPages } from '@/lib/supabasePaginate';

/**
 * The canonical internal export (PRODUCT-CATALOG-STANDARD.md §8) — admin/
 * staff only, includes cost/warehouse/carrier_raw/grade. Column order and
 * names are exactly docs/integrations/product-import-template.csv's header
 * line, character for character — that identity is what makes "export →
 * edit → re-import" a no-op on an unmodified file. See
 * canonicalExport.test.ts, which asserts this against the template file
 * directly rather than a hand-copied string (so the two can never drift
 * silently).
 */
export const CANONICAL_HEADERS = [
  'sku',
  'make',
  'model',
  'model_number',
  'product_family',
  'category',
  'capacity',
  'color',
  'carrier',
  'carrier_raw',
  'lock_status',
  'grade',
  'grade_scale',
  'condition',
  'protocol',
  'warehouse',
  'quantity',
  'qty_is_floor',
  'unit_cost_cents',
  'currency',
] as const;

export type CanonicalCsvRow = Record<(typeof CANONICAL_HEADERS)[number], string>;

export type CtiaGrade = 'NEW' | 'CPO' | 'A' | 'B' | 'C' | 'D';

/** Same total order as the public.ctia_grade Postgres enum declaration
 * (20260806120100: 'NEW','CPO','A','B','C','D') — used to replicate
 * catalog_listing's "worst-case tiebreak" when a grade label maps to more
 * than one CTIA grade across vendors. */
const CTIA_ORDER: readonly CtiaGrade[] = ['NEW', 'CPO', 'A', 'B', 'C', 'D'];

/**
 * CTIA grade -> coarse storefront VariantCondition, per
 * PRODUCT-CATALOG-STANDARD.md §3 / PRICING-ENGINE.md §2: A -> used_a,
 * B -> used_b, C **and** D -> used_c (there is no used_d in the
 * VariantCondition enum — D folds into the coarsest used bucket, same as
 * C), NEW/CPO map to their own explicit labels. Pure function — unit
 * tested directly.
 */
export function ctiaToCondition(ctia: CtiaGrade): 'new' | 'cpo' | 'used_a' | 'used_b' | 'used_c' {
  switch (ctia) {
    case 'NEW':
      return 'new';
    case 'CPO':
      return 'cpo';
    case 'A':
      return 'used_a';
    case 'B':
      return 'used_b';
    case 'C':
    case 'D':
      return 'used_c';
  }
}

/** Resolves a raw vendor grade label to its CTIA grade via the supplied
 * map, defaulting to the same safe 'C' used everywhere else in this
 * project (grade_classification_queue, reprice_variants) when unmapped. */
export function resolveCtia(grade: string, map: ReadonlyMap<string, CtiaGrade>): CtiaGrade {
  return map.get(grade.trim().toUpperCase()) ?? 'C';
}

/** Raw shape of the nested PostgREST select — mirrors InventoryPage.tsx's
 * convention (no generated DB types in this project). Deliberately does
 * NOT filter qty > 0: quantity 0 is a valid, meaningful row (PRODUCT-
 * CATALOG-STANDARD.md §7.2) and this export is a full-catalog backup, not
 * an "in stock only" view. */
export interface RawExportRow {
  qty: number;
  qty_is_floor: boolean;
  unit_cost_cents: number | null;
  currency: string;
  variant: {
    sku: string;
    grade: string;
    grade_scale: string;
    carrier: string;
    carrier_raw: string;
    capacity: string;
    color: string | null;
    lock_status: string;
    protocol: string | null;
    product: {
      make: string;
      model: string;
      model_number: string;
      product_family: string | null;
      category: string;
    } | null;
  } | null;
  location: { code: string } | null;
}

const PAGE_SIZE = 1000;

async function fetchExportRows(): Promise<RawExportRow[]> {
  return fetchAllPages<RawExportRow>(
    async (from, to) => {
      // supabase-js infers embedded (foreign-table) selects as arrays —
      // it has no way to know these FKs are single-row — so the raw
      // response needs the same `as unknown as RawExportRow[]` cast
      // InventoryPage.tsx uses for the identical shape (no generated DB
      // types in this project).
      const { data, error } = await supabase
        .from('inventory')
        .select(
          `qty, qty_is_floor, unit_cost_cents, currency,
           variant:product_variants ( sku, grade, grade_scale, carrier, carrier_raw, capacity, color, lock_status, protocol,
             product:products ( make, model, model_number, product_family, category ) ),
           location:stock_locations ( code )`,
        )
        .order('id')
        .range(from, to);
      return { data: (data ?? []) as unknown as RawExportRow[], error };
    },
    PAGE_SIZE,
  );
}

async function fetchVendorGradeMap(): Promise<Map<string, CtiaGrade>> {
  const { data, error } = await supabase.from('vendor_grade_map').select('vendor_grade, ctia');
  if (error) throw new Error(error.message);
  const map = new Map<string, CtiaGrade>();
  for (const row of data ?? []) {
    const key = String(row.vendor_grade).trim().toUpperCase();
    const ctia = row.ctia as CtiaGrade;
    const existing = map.get(key);
    if (!existing || CTIA_ORDER.indexOf(ctia) > CTIA_ORDER.indexOf(existing)) {
      map.set(key, ctia);
    }
  }
  return map;
}

/** Rows whose base entities (variant/product/location) were somehow deleted
 * out from under an inventory row are dropped rather than crashing the
 * export — same convention as InventoryPage.tsx's toInventoryRow. */
export function toCanonicalCsvRow(r: RawExportRow, ctiaMap: ReadonlyMap<string, CtiaGrade>): CanonicalCsvRow | null {
  if (!r.variant || !r.variant.product || !r.location) return null;
  const v = r.variant;
  const p = v.product!;
  const ctia = resolveCtia(v.grade, ctiaMap);
  return {
    sku: v.sku,
    make: p.make,
    model: p.model,
    model_number: p.model_number,
    product_family: p.product_family ?? '',
    category: p.category,
    capacity: v.capacity,
    color: v.color ?? '',
    // DB code (ATT/VZW/…), not the stale template's lowercase word form —
    // see canonicalExport.test.ts for the round-trip rationale against
    // lib/import/normalize.ts's foldCarrier.
    carrier: v.carrier,
    carrier_raw: v.carrier_raw,
    lock_status: v.lock_status,
    grade: v.grade,
    grade_scale: v.grade_scale,
    condition: ctiaToCondition(ctia),
    protocol: v.protocol ?? '',
    warehouse: r.location.code,
    quantity: String(r.qty),
    qty_is_floor: r.qty_is_floor ? 'true' : 'false',
    unit_cost_cents: r.unit_cost_cents === null ? '' : String(r.unit_cost_cents),
    currency: r.currency,
  };
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function buildCanonicalCsv(rows: readonly CanonicalCsvRow[]): string {
  const lines = [CANONICAL_HEADERS.join(',')];
  for (const row of rows) {
    lines.push(CANONICAL_HEADERS.map((h) => csvEscape(row[h])).join(','));
  }
  return lines.join('\n');
}

function buildCanonicalWorkbook(rows: readonly CanonicalCsvRow[]): XLSX.WorkBook {
  const aoa: string[][] = [
    [...CANONICAL_HEADERS],
    ...rows.map((r) => CANONICAL_HEADERS.map((h) => r[h])),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
  return wb;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Fetches the full canonical inventory (admin/staff RLS gates the
 * underlying tables) and triggers a browser download. Paginates past
 * PostgREST's default row cap via fetchAllPages — the reference HYLA feed
 * alone is 2,675 rows (PRODUCT-CATALOG-STANDARD.md §9), well past a single
 * unbounded select. */
export async function downloadCanonicalExport(format: 'csv' | 'xlsx'): Promise<{ rowCount: number }> {
  const [rawRows, ctiaMap] = await Promise.all([fetchExportRows(), fetchVendorGradeMap()]);
  const rows = rawRows.map((r) => toCanonicalCsvRow(r, ctiaMap)).filter((r): r is CanonicalCsvRow => r !== null);
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === 'csv') {
    const blob = new Blob([buildCanonicalCsv(rows)], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(blob, `omp-canonical-inventory-${stamp}.csv`);
  } else {
    XLSX.writeFile(buildCanonicalWorkbook(rows), `omp-canonical-inventory-${stamp}.xlsx`);
  }

  return { rowCount: rows.length };
}
