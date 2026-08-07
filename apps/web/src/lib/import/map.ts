/**
 * MAP stage (SMART-STOCK-IMPORT.md stage 2) — three layers, in order:
 *   1. Synonym dictionary (public.import_synonyms, kind='header') — exact,
 *      case/space/accent-insensitive.
 *   2. Fuzzy header match — token overlap + edit distance against the same
 *      dictionary, for headers layer 1 missed (e.g. "QTY Avail." -> quantity).
 *   3. Content inference — sample values in unmapped columns and classify by
 *      shape (capacity, lock_status, carrier, grade, cost, quantity, make,
 *      warehouse).
 *
 * Each mapping carries a confidence score; below CONFIDENCE_THRESHOLD it is
 * surfaced to a human mapping screen instead of applied silently.
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
  const mappings: ColumnMapping[] = [];
  const claimedFields = new Set<CanonicalField>();
  const remaining: string[] = [];

  // Layer 1: exact synonym match.
  for (const col of headers) {
    const norm = normalize(col);
    const field = dict.get(norm);
    if (field && !claimedFields.has(field)) {
      mappings.push({ column: col, field, confidence: 1, layer: 'synonym' });
      claimedFields.add(field);
    } else {
      remaining.push(col);
    }
  }

  // Layer 2: fuzzy match against the same dictionary's synonym strings.
  const stillRemaining: string[] = [];
  const dictEntries = Array.from(dict.entries());
  for (const col of remaining) {
    const norm = normalize(col);
    let bestField: CanonicalField | null = null;
    let bestScore = 0;
    for (const [syn, field] of dictEntries) {
      if (claimedFields.has(field)) continue;
      const score = Math.max(tokenOverlapScore(norm, syn), editSimilarity(norm, syn));
      if (score > bestScore) {
        bestScore = score;
        bestField = field;
      }
    }
    if (bestField && bestScore >= 0.5) {
      mappings.push({ column: col, field: bestField, confidence: bestScore, layer: 'fuzzy' });
      claimedFields.add(bestField);
    } else {
      stillRemaining.push(col);
    }
  }

  // Layer 3: content inference on whatever is left.
  const unmapped: string[] = [];
  for (const col of stillRemaining) {
    const values = rows.map((r) => r[col]);
    const guess = classifyByContent(values);
    if (guess && !claimedFields.has(guess.field)) {
      mappings.push({ column: col, field: guess.field, confidence: guess.confidence, layer: 'content' });
      claimedFields.add(guess.field);
    } else {
      unmapped.push(col);
    }
  }

  const needsReview = mappings.filter((m) => m.confidence < CONFIDENCE_THRESHOLD);

  return { mappings, unmapped, needsReview };
}
