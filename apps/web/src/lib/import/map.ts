/**
 * MAP stage (SMART-STOCK-IMPORT.md stage 2) — three evidence layers scored per
 * column, then a SINGLE global greedy assignment by confidence:
 *   1. Synonym dictionary (public.import_synonyms, kind='header') — exact,
 *      case/space/accent-insensitive → confidence 1.
 *   2. Fuzzy header match — token overlap + edit distance against the same
 *      dictionary (e.g. "Colour" -> color), gated at FUZZY_MIN.
 *   3. Content inference — sample the column's values and classify by shape
 *      (capacity, lock_status, carrier, grade, cost, quantity, make,
 *      model_number).
 *
 * Every (column → field) proposal from all three layers competes in one pool;
 * we assign strongest-first, so a genuine content match (e.g. a "$210" cost
 * column at 1.00) always wins its field over a weak fuzzy header guess (0.50),
 * regardless of which column appears first in the sheet. This kills the
 * slot-stealing where an early weak match locked a field the real column needed.
 * A column whose best proposal is below CONFIDENCE_THRESHOLD is surfaced for a
 * human to confirm; a column with no proposal is surfaced as unmapped. Nothing
 * is ever silently guessed or dropped.
 */
import { supabase } from '@/lib/supabase';
import { CARRIER_CODES } from './types';

export type CanonicalField =
  | 'make'
  | 'model'
  | 'model_number'
  | 'category'
  | 'capacity'
  | 'color'
  | 'grade'
  | 'carrier'
  | 'lock_status'
  | 'currency'
  | 'quantity'
  | 'cost'
  | 'warehouse'
  | 'description';

export const CANONICAL_FIELDS: readonly CanonicalField[] = [
  'make', 'model', 'model_number', 'category', 'capacity', 'color',
  'grade', 'carrier', 'lock_status', 'currency', 'quantity', 'cost',
  'warehouse', 'description',
];

export type MapLayer = 'synonym' | 'fuzzy' | 'content';

export interface ColumnMapping {
  column: string;
  field: CanonicalField;
  confidence: number;
  layer: MapLayer;
}

export interface MapResult {
  mappings: ColumnMapping[];
  /** Columns that got no mapping at all — never silently ignored, surfaced for manual pick. */
  unmapped: string[];
  /** Mappings below CONFIDENCE_THRESHOLD — needs a human to confirm once. */
  needsReview: ColumnMapping[];
}

export const CONFIDENCE_THRESHOLD = 0.75;

/**
 * Minimum fuzzy header score to even PROPOSE a mapping. Below this a fuzzy
 * guess is noise (e.g. "Device" scoring 0.50 against "cost") and must not
 * claim a field — content inference or a manual remap handles that column
 * instead. Genuine near-spellings ("Colour"→color ≈ 0.83) clear it easily.
 */
export const FUZZY_MIN = 0.72;

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents (combining diacritical marks)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array<number>(n + 1);
  for (let j = 0; j <= n; j += 1) dp[j] = j;
  for (let i = 1; i <= m; i += 1) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

function tokenOverlapScore(a: string, b: string): number {
  const at = new Set(a.split(' ').filter(Boolean));
  const bt = new Set(b.split(' ').filter(Boolean));
  if (at.size === 0 || bt.size === 0) return 0;
  let shared = 0;
  for (const t of at) if (bt.has(t)) shared += 1;
  return shared / Math.max(at.size, bt.size);
}

function editSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/** Fetches the header-synonym dictionary from the DB: normalized synonym -> canonical field. */
export async function fetchHeaderSynonyms(): Promise<Map<string, CanonicalField>> {
  const { data, error } = await supabase
    .from('import_synonyms')
    .select('canonical_field, synonym')
    .eq('kind', 'header');

  if (error) throw error;

  const dict = new Map<string, CanonicalField>();
  for (const row of data ?? []) {
    dict.set(normalize(row.synonym as string), row.canonical_field as CanonicalField);
  }
  return dict;
}

const CAPACITY_RE = /^\s*\d+(\.\d+)?\s*(gb|tb)\s*$/i;
const LOCK_RE = /^\s*(locked|unlocked|lock|unlock|l|u|yes|no)\s*$/i;
const GRADE_RE = /^\s*(dls|tps)\s*[a-d]{1,2}[+-]?\s*$/i;
const MONEY_RE = /^\s*\$?\s*-?\d{1,3}(,\d{3})*(\.\d{1,2})?\s*$/;
const QTY_RE = /^\s*\d+\s*\+?\s*$/;
const KNOWN_MAKES = new Set(['apple', 'samsung', 'google', 'motorola', 'lg', 'oneplus', 'nokia']);
// Distinctive OEM part-number shapes: Apple A2482, Samsung SM-S911U, Google
// GX7AS, Motorola XT2201, plus a conservative 2-letter+4-digit generic. Kept
// tight so it won't swallow model names, capacities, or grades (all classified
// earlier and returned first).
const MODELNO_RE = /^(a\d{4}|sm-[a-z]\d{2,4}[a-z0-9]*|g[a-z0-9]{4,}|xt\d{3,4}([- ]?\d+)?|[a-z]{2}\d{4})$/i;

function classifyByContent(values: unknown[]): { field: CanonicalField; confidence: number } | null {
  const sample = values
    .filter((v) => v !== null && v !== undefined && String(v).trim() !== '')
    .slice(0, 50)
    .map((v) => String(v).trim());
  if (sample.length === 0) return null;

  const hitRate = (re: RegExp) => sample.filter((v) => re.test(v)).length / sample.length;

  const capacityHit = hitRate(CAPACITY_RE);
  if (capacityHit >= 0.8) return { field: 'capacity', confidence: capacityHit };

  const lockHit = hitRate(LOCK_RE);
  if (lockHit >= 0.8) return { field: 'lock_status', confidence: lockHit };

  const gradeHit = hitRate(GRADE_RE);
  if (gradeHit >= 0.6) return { field: 'grade', confidence: gradeHit };

  const carrierHit = sample.filter((v) => {
    const u = v.toUpperCase();
    return (CARRIER_CODES as readonly string[]).includes(u) || /verizon|t-mobile|sprint|boost|spectrum|xfinity|unlocked|generic/i.test(v);
  }).length / sample.length;
  if (carrierHit >= 0.6) return { field: 'carrier', confidence: carrierHit };

  const moneyHit = hitRate(MONEY_RE);
  if (moneyHit >= 0.8) {
    // Money-shaped AND small-int-shaped both match "123" — prefer quantity
    // when every sampled value is a bare small integer (no $ sign, no
    // decimals, no thousands separator), since that is far more common for
    // a stock sheet's Quantity column than its Cost column.
    const looksLikeBareInt = sample.every((v) => /^\d{1,4}\+?$/.test(v));
    if (!looksLikeBareInt) return { field: 'cost', confidence: moneyHit };
  }

  const qtyHit = hitRate(QTY_RE);
  if (qtyHit >= 0.8) return { field: 'quantity', confidence: qtyHit };

  const makeHit = sample.filter((v) => KNOWN_MAKES.has(v.toLowerCase())).length / sample.length;
  if (makeHit >= 0.6) return { field: 'make', confidence: makeHit };

  const modelNoHit = hitRate(MODELNO_RE);
  if (modelNoHit >= 0.6) return { field: 'model_number', confidence: modelNoHit };

  return null;
}

/**
 * Maps raw sheet headers to canonical fields using the three layers above.
 * `rows` is used only by layer 3 (content inference) to sample cell values.
 */
export async function mapColumns(
  headers: string[],
  rows: Record<string, unknown>[],
  synonyms?: Map<string, CanonicalField>,
): Promise<MapResult> {
  const dict = synonyms ?? (await fetchHeaderSynonyms());
  const dictEntries = Array.from(dict.entries());

  // Phase 1 — SCORE: collect every (column → field) proposal from all three
  // layers into one pool. No field is claimed yet; a column can propose from
  // several layers and the strongest proposal per column is kept.
  interface Candidate extends ColumnMapping {
    colIndex: number;
  }
  const candidates: Candidate[] = [];

  headers.forEach((col, colIndex) => {
    const norm = normalize(col);
    const perCol: ColumnMapping[] = [];

    // Layer 1: exact synonym → confidence 1.
    const exact = dict.get(norm);
    if (exact) perCol.push({ column: col, field: exact, confidence: 1, layer: 'synonym' });

    // Layer 2: best fuzzy match over the dictionary, gated at FUZZY_MIN.
    let fuzzyField: CanonicalField | null = null;
    let fuzzyScore = 0;
    for (const [syn, field] of dictEntries) {
      const score = Math.max(tokenOverlapScore(norm, syn), editSimilarity(norm, syn));
      if (score > fuzzyScore) {
        fuzzyScore = score;
        fuzzyField = field;
      }
    }
    if (fuzzyField && fuzzyScore >= FUZZY_MIN) {
      perCol.push({ column: col, field: fuzzyField, confidence: fuzzyScore, layer: 'fuzzy' });
    }

    // Layer 3: content inference on this column's values.
    const guess = classifyByContent(rows.map((r) => r[col]));
    if (guess) perCol.push({ column: col, field: guess.field, confidence: guess.confidence, layer: 'content' });

    for (const m of perCol) candidates.push({ ...m, colIndex });
  });

  // Phase 2 — ASSIGN: strongest proposal first. Ties broken by layer trust
  // (synonym > content > fuzzy) then by original column order, so assignment is
  // deterministic. A proposal is taken only if neither its column nor its field
  // is already claimed — so the real cost column wins `cost` over a weak fuzzy
  // guess, and the loser falls through to its next-best proposal or to unmapped.
  const layerRank: Record<MapLayer, number> = { synonym: 0, content: 1, fuzzy: 2 };
  candidates.sort(
    (a, b) =>
      b.confidence - a.confidence ||
      layerRank[a.layer] - layerRank[b.layer] ||
      a.colIndex - b.colIndex,
  );

  const mappings: ColumnMapping[] = [];
  const claimedFields = new Set<CanonicalField>();
  const claimedCols = new Set<string>();
  for (const c of candidates) {
    if (claimedCols.has(c.column) || claimedFields.has(c.field)) continue;
    mappings.push({ column: c.column, field: c.field, confidence: c.confidence, layer: c.layer });
    claimedCols.add(c.column);
    claimedFields.add(c.field);
  }

  const unmapped = headers.filter((h) => !claimedCols.has(h));
  const needsReview = mappings.filter((m) => m.confidence < CONFIDENCE_THRESHOLD);

  return { mappings, unmapped, needsReview };
}
