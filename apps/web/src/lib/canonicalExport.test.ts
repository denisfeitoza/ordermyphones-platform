import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  CANONICAL_HEADERS,
  buildCanonicalCsv,
  ctiaToCondition,
  resolveCtia,
  toCanonicalCsvRow,
  type CtiaGrade,
  type RawExportRow,
} from './canonicalExport';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.resolve(dirname, '../../../../docs/integrations/product-import-template.csv');

describe('CANONICAL_HEADERS', () => {
  it('matches product-import-template.csv\'s header line character for character', () => {
    // Read the real template rather than hand-copying its header — the
    // whole point of this test is that the two can never silently drift
    // (PRODUCT-CATALOG-STANDARD.md §8: "export → edit → re-import is a
    // no-op" depends on this identity).
    const firstLine = readFileSync(TEMPLATE_PATH, 'utf8').split(/\r?\n/, 1)[0];
    expect(CANONICAL_HEADERS.join(',')).toBe(firstLine);
  });
});

describe('ctiaToCondition', () => {
  it('maps every CTIA grade to a PRODUCT-CATALOG-STANDARD.md §3 condition', () => {
    expect(ctiaToCondition('NEW')).toBe('new');
    expect(ctiaToCondition('CPO')).toBe('cpo');
    expect(ctiaToCondition('A')).toBe('used_a');
    expect(ctiaToCondition('B')).toBe('used_b');
    expect(ctiaToCondition('C')).toBe('used_c');
    // No used_d in VariantCondition — D folds into the coarsest bucket, same as C.
    expect(ctiaToCondition('D')).toBe('used_c');
  });
});

describe('resolveCtia', () => {
  it('is case/whitespace-insensitive against the map', () => {
    const map = new Map<string, CtiaGrade>([['DLS B+', 'B']]);
    expect(resolveCtia(' dls b+ ', map)).toBe('B');
  });

  it('defaults an unmapped grade to the same safe CTIA C used everywhere else (PRICING-ENGINE.md §2 orphan grade)', () => {
    const map = new Map<string, CtiaGrade>([['DLS B+', 'B']]);
    expect(resolveCtia('TPS A-', map)).toBe('C');
  });
});

function baseRow(overrides: Partial<RawExportRow> = {}): RawExportRow {
  return {
    qty: 120,
    qty_is_floor: false,
    unit_cost_cents: 13600,
    currency: 'USD',
    variant: {
      sku: 'APPLE-A2111-64GB-BLACK-ATT-UNLOCKED-DBP',
      grade: 'DLS B+',
      grade_scale: 'DLS',
      carrier: 'ATT',
      carrier_raw: 'ATT',
      capacity: '64GB',
      color: 'Black',
      lock_status: 'unlocked',
      protocol: 'GSM',
      product: {
        make: 'Apple',
        model: 'iPhone 11',
        model_number: 'A2111',
        product_family: 'iPhone 11',
        category: 'phones',
      },
    },
    location: { code: 'W23-ATT' },
    ...overrides,
  };
}

describe('toCanonicalCsvRow + buildCanonicalCsv', () => {
  const ctiaMap = new Map<string, CtiaGrade>([['DLS B+', 'B']]);

  it('produces a row + CSV line matching the template\'s DLS B+ example exactly', () => {
    const row = toCanonicalCsvRow(baseRow(), ctiaMap);
    expect(row).not.toBeNull();
    expect(row!.condition).toBe('used_b');
    expect(row!.qty_is_floor).toBe('false');
    expect(row!.unit_cost_cents).toBe('13600');

    const csv = buildCanonicalCsv([row!]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe(CANONICAL_HEADERS.join(','));
    expect(lines[1]).toBe(
      'APPLE-A2111-64GB-BLACK-ATT-UNLOCKED-DBP,Apple,iPhone 11,A2111,iPhone 11,phones,64GB,Black,ATT,ATT,unlocked,DLS B+,DLS,used_b,GSM,W23-ATT,120,false,13600,USD',
    );
  });

  it('renders a null color and null unit_cost_cents as an empty cell, never the string "null"', () => {
    const row = toCanonicalCsvRow(
      baseRow({
        unit_cost_cents: null,
        variant: {
          ...baseRow().variant!,
          color: null,
          product: { ...baseRow().variant!.product!, product_family: null },
        },
      }),
      ctiaMap,
    );
    expect(row!.color).toBe('');
    expect(row!.product_family).toBe('');
    expect(row!.unit_cost_cents).toBe('');
  });

  it('does NOT drop a zero-quantity row — quantity 0 is a valid backup row', () => {
    const row = toCanonicalCsvRow(baseRow({ qty: 0 }), ctiaMap);
    expect(row).not.toBeNull();
    expect(row!.quantity).toBe('0');
  });

  it('drops a row whose variant/product/location was deleted out from under it, without throwing', () => {
    expect(toCanonicalCsvRow(baseRow({ variant: null }), ctiaMap)).toBeNull();
    expect(toCanonicalCsvRow(baseRow({ location: null }), ctiaMap)).toBeNull();
  });

  it('quotes a field containing a comma', () => {
    const row = toCanonicalCsvRow(
      baseRow({ variant: { ...baseRow().variant!, color: 'Black, Slate' } }),
      ctiaMap,
    );
    const csv = buildCanonicalCsv([row!]);
    expect(csv).toContain('"Black, Slate"');
  });
});
