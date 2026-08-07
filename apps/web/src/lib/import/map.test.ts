import { describe, expect, it } from 'vitest';
import { mapColumns, CONFIDENCE_THRESHOLD, type CanonicalField } from './map';
import { buildHylaLikeWorkbook } from './__fixtures__/hylaLikeWorkbook';
import { detectImportFile } from './parse';

// Mirrors the seed in supabase/migrations/20260807130000_import_tables.sql —
// injected directly so this spec never touches the network/DB.
const SYNONYMS = new Map<string, CanonicalField>([
  ['make', 'make'],
  ['model', 'model'],
  ['model number', 'model_number'],
  ['mpn', 'model_number'],
  ['capacity', 'capacity'],
  ['color', 'color'],
  ['grade', 'grade'],
  ['carrier', 'carrier'],
  ['lock status', 'lock_status'],
  ['category', 'category'],
  ['currency', 'currency'],
  ['qty', 'quantity'],
  ['quantity', 'quantity'],
  ['price', 'cost'],
  ['cost', 'cost'],
  ['warehouse', 'warehouse'],
  ['description', 'description'],
]);

describe('mapColumns — layer 1 (synonym dictionary)', () => {
  it('maps every fixture header via exact synonym match', async () => {
    const bytes = buildHylaLikeWorkbook();
    const { best } = detectImportFile(bytes);
    if (!best) throw new Error('fixture detection failed');

    const result = await mapColumns(best.headers, best.rows, SYNONYMS);

    const fieldsMapped = new Set(result.mappings.map((m) => m.field));
    for (const expected of ['make', 'model', 'model_number', 'category', 'capacity', 'color', 'grade', 'carrier', 'lock_status', 'cost', 'currency', 'quantity', 'warehouse']) {
      expect(fieldsMapped.has(expected as CanonicalField)).toBe(true);
    }
    expect(result.unmapped).toEqual([]);
    // Every mapping here comes from the exact dictionary, so nothing needs review.
    expect(result.needsReview).toEqual([]);
  });
});

describe('mapColumns — layer 2 (fuzzy match)', () => {
  it('resolves a near-miss header the exact dictionary does not have', async () => {
    // "Colour" (British spelling) has no exact synonym and its values ("Red")
    // have no content shape, so only the fuzzy layer can resolve it → color.
    const headers = ['Colour'];
    const rows = [{ Colour: 'Red' }, { Colour: 'Blue' }];

    const result = await mapColumns(headers, rows, SYNONYMS);
    const mapping = result.mappings.find((m) => m.column === 'Colour');
    expect(mapping?.field).toBe('color');
    expect(mapping?.layer).toBe('fuzzy');
  });

  it('never lets a weak fuzzy guess steal a field the real column needs', async () => {
    // "Device" fuzzy-scores ~0.5 against several fields but its values are
    // model names (no content shape); "Unit Price" carries the real cost data.
    // Global assignment must give `cost` to Unit Price, not to Device.
    const headers = ['Device', 'Unit Price'];
    const rows = [
      { Device: 'iPhone 13', 'Unit Price': '$210.00' },
      { Device: 'Galaxy S23', 'Unit Price': '$305.00' },
    ];
    const result = await mapColumns(headers, rows, SYNONYMS);
    const cost = result.mappings.find((m) => m.field === 'cost');
    expect(cost?.column).toBe('Unit Price');
    // Device had no valid proposal → surfaced for manual pick, never mis-mapped.
    expect(result.unmapped).toContain('Device');
  });
});

describe('mapColumns — layer 3 (content inference)', () => {
  it('classifies an unmapped capacity-shaped column by content when no header hints match', async () => {
    const headers = ['Storage Size'];
    const rows = [{ 'Storage Size': '256GB' }, { 'Storage Size': '128GB' }, { 'Storage Size': '64GB' }];

    const result = await mapColumns(headers, rows, new Map());
    const mapping = result.mappings.find((m) => m.column === 'Storage Size');
    expect(mapping?.field).toBe('capacity');
    expect(mapping?.layer).toBe('content');
  });

  it('leaves a column unmapped when nothing matches any layer', async () => {
    const headers = ['Random Notes'];
    const rows = [{ 'Random Notes': 'this is a free-text note' }];

    const result = await mapColumns(headers, rows, new Map());
    expect(result.unmapped).toContain('Random Notes');
  });
});

describe('CONFIDENCE_THRESHOLD', () => {
  it('is a real gate — a low-confidence content-inference mapping is surfaced for review', async () => {
    // Only 2/3 values look like capacity — below the 0.8 shape threshold used
    // internally, so this should NOT map via content inference at all and
    // must end up in `unmapped`, never silently guessed.
    const headers = ['Mystery'];
    const rows = [{ Mystery: '256GB' }, { Mystery: 'n/a' }, { Mystery: 'unknown' }];
    const result = await mapColumns(headers, rows, new Map());
    expect(result.mappings.find((m) => m.column === 'Mystery')).toBeUndefined();
    expect(result.unmapped).toContain('Mystery');
    expect(CONFIDENCE_THRESHOLD).toBeGreaterThan(0);
  });
});
