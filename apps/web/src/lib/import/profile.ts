/**
 * Import profiles — the "remap memory" (SMART-STOCK-IMPORT.md "Mapping
 * profiles"). Keyed (supplier_id, header_fingerprint): a repeat upload of
 * the same layout applies the saved column map with zero clicks and skips
 * straight to DRY-RUN.
 *
 * `column_map` is stored as the same shape the wizard uses in memory
 * (sourceHeader -> canonicalField), so there is exactly one representation
 * of a mapping in the whole pipeline — see map.ts's ColumnMapping /
 * CanonicalField and normalize.ts's projectRow, which both key off this
 * same `Map<string, CanonicalField>`.
 */
import { supabase } from '@/lib/supabase';
import type { CanonicalField } from './map';

export interface ImportProfile {
  id: string;
  supplierId: string;
  headerFingerprint: string;
  sheetName: string | null;
  headerRow: number | null;
  columnMap: Record<string, CanonicalField>;
}

/** Normalizes a header the same way computeHeaderFingerprint (commit.ts) does, so a profile saved under one casing/spacing still matches a re-upload that differs only in that. */
function normalizeHeaderKey(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Looks up a saved profile for (supplier, header_fingerprint). Returns null on no match — that is the normal "first time we see this layout" case, not an error. */
export async function fetchImportProfile(supplierId: string, headerFingerprint: string): Promise<ImportProfile | null> {
  const { data, error } = await supabase
    .from('import_profiles')
    .select('id, supplier_id, header_fingerprint, sheet_name, header_row, column_map')
    .eq('supplier_id', supplierId)
    .eq('header_fingerprint', headerFingerprint)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id as string,
    supplierId: data.supplier_id as string,
    headerFingerprint: data.header_fingerprint as string,
    sheetName: (data.sheet_name as string | null) ?? null,
    headerRow: (data.header_row as number | null) ?? null,
    columnMap: (data.column_map as Record<string, CanonicalField>) ?? {},
  };
}

/**
 * Applies a saved profile's column_map to THIS file's actual headers by
 * normalized-text match (not exact key match) — the fingerprint hashes
 * normalized+sorted headers, so a fingerprint hit only guarantees the same
 * normalized header set, not identical casing/spacing on each column.
 */
export function applyProfileColumnMap(
  columnMap: Record<string, CanonicalField>,
  currentHeaders: string[],
): Map<string, CanonicalField> {
  const byNorm = new Map<string, CanonicalField>();
  for (const [header, field] of Object.entries(columnMap)) {
    byNorm.set(normalizeHeaderKey(header), field);
  }

  const result = new Map<string, CanonicalField>();
  for (const header of currentHeaders) {
    const field = byNorm.get(normalizeHeaderKey(header));
    if (field) result.set(header, field);
  }
  return result;
}

/**
 * Saves (upserts) the confirmed mapping as an import profile — called only
 * after a successful commit (never on a dry-run-only path), so a profile
 * always reflects a mapping that produced a real, accepted import.
 */
export async function saveImportProfile(args: {
  supplierId: string;
  headerFingerprint: string;
  sheetName: string | null;
  headerRow: number | null;
  columnMap: Map<string, CanonicalField>;
}): Promise<void> {
  const { error } = await supabase.from('import_profiles').upsert(
    {
      supplier_id: args.supplierId,
      header_fingerprint: args.headerFingerprint,
      sheet_name: args.sheetName,
      header_row: args.headerRow,
      column_map: Object.fromEntries(args.columnMap),
    },
    { onConflict: 'supplier_id,header_fingerprint' },
  );
  if (error) throw error;
}
