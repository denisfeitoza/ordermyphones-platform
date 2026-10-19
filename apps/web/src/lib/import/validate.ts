/**
 * VALIDATE stage (SMART-STOCK-IMPORT.md stage 4) — per-row accept/reject
 * with a reason, mirroring the server-side rules in commit_stock_import
 * (supabase/migrations/20260807140000_import_helpers_commit_rpc.sql) for
 * the DRY-RUN preview. The RPC is the authority at commit time; this exists
 * so the preview's accept/reject counts are trustworthy before the user
 * commits.
 */
import { makeSku } from './sku';
import {
  normalizeCapacity,
  normalizeCarrier,
  normalizeColor,
  normalizeCostCents,
  normalizeLockStatus,
  normalizeQuantity,
} from './normalize';
import type { CarrierCode, NormalizedRow, RawImportRow, RejectReason, ValidatedRow } from './types';

const VALID_CATEGORIES = new Set(['phones', 'accessories', 'wearables']);

/** Owner sheets say "Smartphone", "Celular", "Watch"… fold them; blank means phones. */
const CATEGORY_SYNONYMS: [RegExp, string][] = [
  [/^(phones?|smart ?phones?|cell ?phones?|mobiles?|celular(es)?|telefones?|tel[eé]fonos?|iphones?|handsets?)$/, 'phones'],
  [/^(wearables?|watch(es)?|smart ?watch(es)?|rel[oó]gios?|relojes?)$/, 'wearables'],
  [/^(accessor(y|ies)|acess[oó]rios?|accesorios?|cases?|capas?|chargers?|carregadores?|cables?|cabos?|headphones?|earbuds?|airpods|audio|[aá]udio)$/, 'accessories'],
];

/** Normalized category, or null when it can't be recognized. */
export function normalizeCategory(raw: unknown): { category: string | null; defaulted: boolean } {
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === '') return { category: 'phones', defaulted: true };
  if (VALID_CATEGORIES.has(s)) return { category: s, defaulted: false };
  for (const [re, cat] of CATEGORY_SYNONYMS) if (re.test(s)) return { category: cat, defaulted: false };
  return { category: null, defaulted: false };
}

/** A sheet without a model-number column still imports: the model name stands in, upper-cased. */
export function deriveModelNumber(model: string): string {
  return model.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Validates + normalizes one row. `rowNumber` is 1-based, matching the
 * server's row-numbering convention (jsonb_array_elements WITH ORDINALITY),
 * so preview reject/warning rows line up with the post-commit audit.
 */
export function validateRow(
  raw: RawImportRow,
  rowNumber: number,
  options?: { carrierSynonyms?: Map<string, CarrierCode>; knownGrades?: Set<string> },
): ValidatedRow {
  const warnings: string[] = [];

  const make = String(raw.make ?? '').trim();
  const model = String(raw.model ?? '').trim();
  let modelNumber = String(raw.modelNumber ?? '').trim();
  if (!modelNumber && model) {
    modelNumber = deriveModelNumber(model);
    warnings.push('model_number_derived');
  }
  const capacityRaw = String(raw.capacity ?? '').trim();
  const warehouseCode = String(raw.warehouseCode ?? '').trim();

  let rejectReason: RejectReason | null = null;

  if (!make || !model || !modelNumber || !capacityRaw || !warehouseCode) {
    rejectReason = 'missing_mandatory';
  }

  const cat = normalizeCategory(raw.category);
  const category = cat.category ?? String(raw.category ?? '').trim().toLowerCase();
  if (cat.defaulted) warnings.push('category_defaulted');
  if (!rejectReason && cat.category === null) {
    rejectReason = 'bad_category';
  }

  const costCents = normalizeCostCents(raw.costRaw);
  if (!rejectReason && (costCents === null || costCents <= 0)) {
    rejectReason = 'bad_cost';
  }

  const qtyResult = normalizeQuantity(raw.qtyRaw);
  if (!rejectReason && qtyResult === null) {
    rejectReason = 'bad_qty';
  }

  const { code: carrier, unmapped: carrierUnmapped } = normalizeCarrier(raw.carrierRaw, options?.carrierSynonyms);
  if (carrierUnmapped) warnings.push('carrier_unmapped');

  const lockStatus = normalizeLockStatus(raw.lockRaw);
  const capacity = normalizeCapacity(capacityRaw);
  const color = normalizeColor(raw.color);
  const vendorGrade = String(raw.vendorGrade ?? '').trim();

  if (vendorGrade && options?.knownGrades && !options.knownGrades.has(vendorGrade.toUpperCase())) {
    warnings.push('grade_unmapped');
  }

  const sku = makeSku(model, modelNumber, capacity, color, vendorGrade, carrier, lockStatus);

  const normalized: NormalizedRow = {
    rowNumber,
    make,
    model,
    modelNumber,
    category,
    capacity,
    color,
    vendorGrade,
    carrier,
    carrierRaw: String(raw.carrierRaw ?? '').trim(),
    carrierUnmapped,
    lockStatus,
    lockRaw: String(raw.lockRaw ?? '').trim(),
    costCents,
    currency: raw.currency ?? 'USD',
    qty: qtyResult?.qty ?? null,
    qtyIsFloor: qtyResult?.isFloor ?? false,
    warehouseCode,
    warehouseName: raw.warehouseName ? String(raw.warehouseName).trim() : null,
    sku,
  };

  return {
    row: normalized,
    accepted: rejectReason === null,
    rejectReason,
    warnings,
  };
}

export function validateRows(
  raws: RawImportRow[],
  options?: { carrierSynonyms?: Map<string, CarrierCode>; knownGrades?: Set<string> },
): ValidatedRow[] {
  return raws.map((r, i) => validateRow(r, r.sheetRow ?? i + 1, options));
}

export interface DryRunSummary {
  rowsTotal: number;
  rowsAccepted: number;
  rowsRejected: number;
  rejectsByReason: Record<string, number>;
  warningsCount: number;
  /** Distinct (variant natural key) count among accepted rows — reveals collisions collapsing to one SKU. */
  distinctSkus: number;
}

export function summarizeDryRun(validated: ValidatedRow[]): DryRunSummary {
  const rejectsByReason: Record<string, number> = {};
  let accepted = 0;
  let warningsCount = 0;
  const skus = new Set<string>();

  for (const v of validated) {
    if (v.accepted) {
      accepted += 1;
      skus.add(v.row.sku);
    } else if (v.rejectReason) {
      rejectsByReason[v.rejectReason] = (rejectsByReason[v.rejectReason] ?? 0) + 1;
    }
    warningsCount += v.warnings.length;
  }

  return {
    rowsTotal: validated.length,
    rowsAccepted: accepted,
    rowsRejected: validated.length - accepted,
    rejectsByReason,
    warningsCount,
    distinctSkus: skus.size,
  };
}
