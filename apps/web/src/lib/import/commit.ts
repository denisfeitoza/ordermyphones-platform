/**
 * COMMIT stage (SMART-STOCK-IMPORT.md stage 6) — thin client wrapper around
 * the public.commit_stock_import RPC (transactional, server-authoritative).
 * Everything upstream (parse/map/normalize/validate) is preview-only; this
 * is the one call that writes.
 */
import { supabase } from '@/lib/supabase';
import type { CommitStockImportPayloadRow, CommitStockImportResult, NormalizedRow } from './types';

export type ImportMode = 'merge' | 'replace_location';

export interface CommitStockImportArgs {
  supplierId: string;
  vendorCode: string;
  mode: ImportMode;
  /** File basename only — never a full path, never a real supplier legal name (D16). Caller sanitizes. */
  sourceLabel: string;
  headerFingerprint: string;
  /** Accepted rows from the dry-run (validate.ts) — rejected rows are never sent. */
  rows: NormalizedRow[];
  locationCode?: string;
}

function toPayloadRow(row: NormalizedRow): CommitStockImportPayloadRow {
  return {
    make: row.make,
    model: row.model,
    model_number: row.modelNumber,
    category: row.category,
    capacity: row.capacity,
    color: row.color,
    vendor_grade: row.vendorGrade,
    carrier_raw: row.carrierRaw,
    lock_raw: row.lockRaw,
    cost_cents: row.costCents,
    currency: row.currency,
    qty_raw: row.qty === null ? '' : row.qtyIsFloor ? `${row.qty}+` : String(row.qty),
    warehouse_code: row.warehouseCode,
    warehouse_name: row.warehouseName,
  };
}

/**
 * Calls commit_stock_import. Throws on any Postgres/RPC error (including the
 * 'not authorized' guard and the replace_location-without-location_code
 * guard) — callers surface the message, never swallow it.
 */
export async function commitStockImport(args: CommitStockImportArgs): Promise<CommitStockImportResult> {
  if (args.mode === 'replace_location' && !args.locationCode) {
    throw new Error('replace_location requires a locationCode');
  }

  const payloadRows = args.rows.map(toPayloadRow);

  const { data, error } = await supabase.rpc('commit_stock_import', {
    p_supplier_id: args.supplierId,
    p_vendor_code: args.vendorCode,
    p_mode: args.mode,
    p_source_label: args.sourceLabel,
    p_header_fingerprint: args.headerFingerprint,
    p_rows: payloadRows,
    p_location_code: args.locationCode ?? null,
  });

  if (error) throw error;

  // Fold freshly-imported model names to their canonical form via the model-
  // alias dictionary (#01). Best-effort: the import already committed, so a
  // fold failure must never fail the import.
  try {
    await supabase.rpc('apply_model_aliases');
  } catch {
    /* non-fatal */
  }

  return data as CommitStockImportResult;
}

/**
 * header_fingerprint = hash(sorted normalized headers) (import_profiles'
 * remap-memory key). Stable across re-uploads of the same layout, changes
 * the moment a vendor renames/adds/removes a column.
 */
export async function computeHeaderFingerprint(headers: string[]): Promise<string> {
  const normalized = headers.map((h) => h.trim().toLowerCase().replace(/\s+/g, ' ')).sort();
  const bytes = new TextEncoder().encode(normalized.join('|'));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
