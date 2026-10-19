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
  /** Accepted rows from the dry-run (validate.ts). */
  rows: NormalizedRow[];
  locationCode?: string;
  /** Replace mode: the dry-run's rejected rows. Never imported — they only keep
   * their variants from being zeroed and count toward the reject ratio. */
  protectRows?: NormalizedRow[];
  /** Replace mode: proceed even when more than 20% of the sheet was rejected. */
  allowMassReplace?: boolean;
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
    sheet_row: row.rowNumber,
  };
}

/** Merge rows per request. ~4k rows commit in ~2 s, far from the 8 s request limit. */
export const MERGE_CHUNK_ROWS = 4000;
/** Replace mode must see the whole location in one call; above this it would risk the 8 s limit. */
export const REPLACE_MAX_ROWS = 8000;

export interface CommitProgress {
  phase: 'commit' | 'reprice';
  done: number;
  total: number;
}

/**
 * Commits the accepted rows. Merge mode sends them in chunks (each chunk is
 * its own audited import run; merge writes target quantities, so re-running
 * after a failed chunk is safe). Replace mode sends one call, capped at
 * REPLACE_MAX_ROWS. Then drains the reprice queue with progress. Throws on
 * any RPC error — callers surface the message.
 */
export async function commitStockImport(args: CommitStockImportArgs, onProgress?: (p: CommitProgress) => void): Promise<CommitStockImportResult> {
  if (args.mode === 'replace_location' && !args.locationCode) {
    throw new Error('replace_location requires a locationCode');
  }
  if (args.mode === 'replace_location' && args.rows.length > REPLACE_MAX_ROWS) {
    throw new Error(`replace_too_large:${REPLACE_MAX_ROWS}`);
  }

  const chunks: NormalizedRow[][] = [];
  const size = args.mode === 'merge' ? MERGE_CHUNK_ROWS : Math.max(1, args.rows.length);
  for (let i = 0; i < args.rows.length; i += size) chunks.push(args.rows.slice(i, i + size));
  if (chunks.length === 0) chunks.push([]);

  const total: CommitStockImportResult = {
    import_run_id: '',
    rows_total: 0,
    rows_accepted: 0,
    rows_rejected: 0,
    movements_written: 0,
    reject_reasons: [],
    warnings: [],
    products_new: 0,
    products_new_no_image: 0,
    reprice_queued: 0,
  };
  let sent = 0;
  for (const [n, chunk] of chunks.entries()) {
    onProgress?.({ phase: 'commit', done: sent, total: args.rows.length });
    const { data, error } = await supabase.rpc('commit_stock_import', {
      p_supplier_id: args.supplierId,
      p_vendor_code: args.vendorCode,
      p_mode: args.mode,
      p_source_label: chunks.length > 1 ? `${args.sourceLabel} (${n + 1}/${chunks.length})` : args.sourceLabel,
      p_header_fingerprint: args.headerFingerprint,
      p_rows: chunk.map(toPayloadRow),
      p_location_code: args.locationCode ?? null,
      p_protect_rows: (args.protectRows ?? []).map(toPayloadRow),
      p_allow_mass_replace: args.allowMassReplace ?? false,
    });
    if (error) {
      throw Object.assign(new Error(sent > 0 ? `${error.message} (part ${n + 1}/${chunks.length}; ${sent} rows before it are already imported — re-running the same file is safe)` : error.message), {
        details: error.details ?? null,
      });
    }
    const r = data as CommitStockImportResult;
    total.import_run_id ||= r.import_run_id;
    total.rows_total += r.rows_total;
    total.rows_accepted += r.rows_accepted;
    total.rows_rejected += r.rows_rejected;
    total.movements_written += r.movements_written;
    total.reject_reasons.push(...r.reject_reasons);
    total.warnings.push(...r.warnings);
    total.products_new += r.products_new ?? 0;
    total.products_new_no_image += r.products_new_no_image ?? 0;
    total.reprice_queued += r.reprice_queued ?? 0;
    sent += chunk.length;
  }
  onProgress?.({ phase: 'commit', done: sent, total: args.rows.length });

  await drainRepriceQueue(total.reprice_queued, onProgress);
  return total;
}

/**
 * Reprices the variants the import touched, ~1.5k per call, reporting
 * progress. If the tab closes midway, pg_cron finishes the queue within a
 * minute — prices are never left stale for long.
 */
export async function drainRepriceQueue(queued: number, onProgress?: (p: CommitProgress) => void): Promise<void> {
  if (queued <= 0) return;
  let left = queued;
  onProgress?.({ phase: 'reprice', done: 0, total: queued });
  // Bounded loop: each call removes up to 1500 rows; the queue cannot refill from here.
  for (let guard = 0; guard < 200 && left > 0; guard += 1) {
    const { data, error } = await supabase.rpc('drain_reprice_queue', { p_limit: 1500 });
    if (error) throw new Error(error.message);
    left = Number(data ?? 0);
    onProgress?.({ phase: 'reprice', done: Math.max(0, queued - left), total: queued });
  }
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
