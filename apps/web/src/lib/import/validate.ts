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
  const modelNumber = String(raw.modelNumber ?? '').trim();
  const capacityRaw = String(raw.capacity ?? '').trim();
  const warehouseCode = String(raw.warehouseCode ?? '').trim();

  let rejectReason: RejectReason | null = null;

  if (!make || !model || !modelNumber || !capacityRaw || !warehouseCode) {
    rejectReason = 'missing_mandatory';
  }

  const category = String(raw.category ?? '').trim().toLowerCase();
  if (!rejectReason && !VALID_CATEGORIES.has(category)) {
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

  const sku = makeSku(model, capacity, color, vendorGrade, carrier, lockStatus);

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
  return raws.map((r, i) => validateRow(r, i + 1, options));
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
