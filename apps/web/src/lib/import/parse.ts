/**
 * DETECT stage (SMART-STOCK-IMPORT.md stage 1) — reads .xls/.xlsx/.csv/.tsv
 * via SheetJS, finds the sheet + header row that actually holds the data
 * (skipping a decorative cover sheet like the real HYLA file's "Cover Page"),
 * and returns rows as plain objects keyed by the raw header text.
 *
 * This layer is deliberately synchronous and DB-free — it only needs a small
 * static list of "looks like a known field" tokens to score header
 * candidates. The full three-layer mapping (synonym dictionary from the DB,
 * fuzzy match, content inference) happens in map.ts.
 */
import * as XLSX from 'xlsx';

/** Rows within the first N rows of a sheet are considered as header candidates. */
const HEADER_SCAN_ROWS = 25;

/** Below this score, DETECT should not silently guess — see detectSheet() confidence. */
export const HEADER_CONFIDENCE_THRESHOLD = 0.35;

/**
 * Lowercase, space-normalized tokens that "look like" a known canonical
 * field. Intentionally broad (not the DB synonym dictionary) — this is only
 * used to score which row is the header row, not to resolve the final
 * column mapping.
 */
const KNOWN_FIELD_TOKENS = new Set([
  'make', 'brand',
  'model', 'model name',
  'model number', 'model no', 'mpn', 'part number',
  'category', 'type',
  'capacity', 'storage',
  'color', 'colour',
  'grade', 'condition', 'vendor grade',
  'carrier', 'network',
  'lock status', 'lock', 'sim lock',
  'price', 'cost', 'unit cost', 'vendor cost', 'unit price',
  'currency',
  'qty', 'quantity', 'quantity available', 'units', 'on hand', 'qty avail', 'qty avail.',
  'warehouse', 'location', 'wh', 'site', 'region',
  'description', 'desc',
  'sku', 'part no',
  'protocol',
  'product family',
]);

function normalizeHeaderToken(v: unknown): string {
  return String(v ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function scoreHeaderRow(cells: unknown[]): number {
  const nonEmpty = cells.filter((c) => normalizeHeaderToken(c) !== '');
  if (nonEmpty.length === 0) return 0;

  const seen = new Set<string>();
  let known = 0;
  let dupes = 0;
  for (const c of nonEmpty) {
    const tok = normalizeHeaderToken(c);
    if (seen.has(tok)) dupes += 1;
    seen.add(tok);
    if (KNOWN_FIELD_TOKENS.has(tok)) known += 1;
  }

  const knownRatio = known / nonEmpty.length;
  const fillRatio = nonEmpty.length / Math.max(cells.length, 1);
  const uniquenessPenalty = dupes / nonEmpty.length;

  return Math.max(0, knownRatio * 0.7 + fillRatio * 0.3 - uniquenessPenalty * 0.5);
}

export interface DetectedSheet {
  sheetName: string;
  headerRowIndex: number;
  headers: string[];
  confidence: number;
  /** Data rows after the header, keyed by raw (trimmed) header text. */
  rows: Record<string, unknown>[];
}

export interface DetectResult {
  best: DetectedSheet | null;
  /** All sheets scanned, for a manual "pick the sheet" fallback UI. */
  candidates: Array<{ sheetName: string; headerRowIndex: number; confidence: number }>;
}

/** Parses raw file bytes and detects the data sheet + header row. */
export function detectImportFile(data: ArrayBuffer | Uint8Array): DetectResult {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const workbook = XLSX.read(bytes, { type: 'array', cellDates: false });

  let best: DetectedSheet | null = null;
  const candidates: DetectResult['candidates'] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const matrix: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: true, defval: null });
    const scanLimit = Math.min(HEADER_SCAN_ROWS, matrix.length);

    for (let r = 0; r < scanLimit; r += 1) {
      const row = matrix[r] ?? [];
      const confidence = scoreHeaderRow(row);
      candidates.push({ sheetName, headerRowIndex: r, confidence });

      if (!best || confidence > best.confidence) {
        const headers = row.map((c, i) => {
          const h = normalizeHeaderToken(c);
          return h === '' ? `__col_${i}` : String(c).trim();
        });
        const dataRows = matrix.slice(r + 1);
        const rows: Record<string, unknown>[] = dataRows
          // Drop fully-blank rows (trailing sheet padding).
          .filter((dr) => (dr ?? []).some((v) => v !== null && v !== undefined && String(v).trim() !== ''))
          .map((dr) => {
            const obj: Record<string, unknown> = {};
            headers.forEach((h, i) => {
              obj[h] = (dr ?? [])[i] ?? null;
            });
            return obj;
          });

        best = { sheetName, headerRowIndex: r, headers, confidence, rows };
      }
    }
  }

  return { best, candidates };
}
