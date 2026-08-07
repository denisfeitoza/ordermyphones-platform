/**
 * Shared types for the Smart Stock Import pipeline
 * (docs/architecture/SMART-STOCK-IMPORT.md, docs/architecture/PRODUCT-CATALOG-STANDARD.md).
 *
 * These mirror the DB enums exactly (supabase/migrations/20260806120100_catalog_products_variants.sql)
 * — NOT the legacy lowercase `Carrier` union in packages/shared-types/src/catalog.ts, which predates
 * the carrier_code enum and uses a different casing/vocabulary.
 */

/** public.carrier_code */
export type CarrierCode = 'ATT' | 'VZW' | 'TMO' | 'SPR' | 'BST' | 'XFI' | 'SPC' | 'UNL' | 'OTH';

/** public.lock_status */
export type LockStatus = 'locked' | 'unlocked';

/** public.grade_scale */
export type GradeScale = 'DLS' | 'TPS' | 'OTHER';

/** public.product_category */
export type ProductCategoryCode = 'phones' | 'accessories' | 'wearables';

export const CARRIER_CODES: readonly CarrierCode[] = ['ATT', 'VZW', 'TMO', 'SPR', 'BST', 'XFI', 'SPC', 'UNL', 'OTH'];

/**
 * One row as it comes out of the sheet, after DETECT + MAP (column headers
 * resolved to canonical fields) but before NORMALIZE. All fields are raw
 * strings/unknowns straight from the cell — normalize.ts turns this into a
 * NormalizedRow, validate.ts decides accept/reject.
 */
export interface RawImportRow {
  make?: string | null;
  model?: string | null;
  modelNumber?: string | null;
  category?: string | null;
  capacity?: string | null;
  color?: string | null;
  vendorGrade?: string | null;
  carrierRaw?: string | null;
  lockRaw?: string | null;
  /** Raw cell value for cost — may be "$123.45", "123.45", 123.45, etc. */
  costRaw?: string | number | null;
  currency?: string | null;
  /** Raw cell value for quantity — may be "200+", "200", 200, etc. */
  qtyRaw?: string | number | null;
  warehouseCode?: string | null;
  warehouseName?: string | null;
  /** Free-text composite description column, kept for content-inference/checksum use only. */
  description?: string | null;
}

/**
 * A row after NORMALIZE (normalize.ts) — client-side preview shape. Money is
 * integer cents, quantity is parsed, carrier/lock/grade are resolved. This
 * mirrors (but does not replace) the server-side normalization inside
 * commit_stock_import — the RPC re-validates authoritatively.
 */
export interface NormalizedRow {
  rowNumber: number;
  make: string;
  model: string;
  modelNumber: string;
  category: string;
  capacity: string;
  color: string | null;
  vendorGrade: string;
  carrier: CarrierCode;
  carrierRaw: string;
  carrierUnmapped: boolean;
  lockStatus: LockStatus;
  /** Original raw cell text the lockStatus was derived from — forwarded to the RPC verbatim, which re-derives independently. */
  lockRaw: string;
  costCents: number | null;
  currency: string;
  qty: number | null;
  qtyIsFloor: boolean;
  warehouseCode: string;
  warehouseName: string | null;
  sku: string;
}

export type RejectReason =
  | 'missing_mandatory'
  | 'bad_category'
  | 'bad_cost'
  | 'bad_qty';

export interface ValidatedRow {
  row: NormalizedRow;
  accepted: boolean;
  rejectReason: RejectReason | null;
  warnings: string[];
}

export interface CommitStockImportPayloadRow {
  make: string;
  model: string;
  model_number: string;
  category: string;
  capacity: string;
  color: string | null;
  vendor_grade: string;
  carrier_raw: string;
  lock_raw: string;
  cost_cents: number | null;
  currency: string;
  qty_raw: string;
  warehouse_code: string;
  warehouse_name: string | null;
}

export interface CommitStockImportResult {
  import_run_id: string;
  rows_total: number;
  rows_accepted: number;
  rows_rejected: number;
  movements_written: number;
  reject_reasons: Array<{ row: number; reason: string; type: 'reject' }>;
  warnings: Array<{ row: number; reason: string; type: 'warning' }>;
}
