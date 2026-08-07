import { describe, expect, it } from 'vitest';
import { validateRows, summarizeDryRun } from './validate';
import { FIXTURE_ROWS, fixtureRowToRawImportRow } from './__fixtures__/hylaLikeWorkbook';

const HYLA_KNOWN_GRADES = new Set(['TPS A+', 'TPS A', 'DLS AA+', 'DLS A+', 'DLS A', 'DLS B+', 'DLS B', 'TPS B+', 'TPS B-', 'TPS C+', 'TPS C-', 'DLS C', 'TPS D']);

const rawRows = FIXTURE_ROWS.map(fixtureRowToRawImportRow);
const validated = validateRows(rawRows, { knownGrades: HYLA_KNOWN_GRADES });

describe('validateRows over the synthetic HYLA-like fixture', () => {
  it('rejects the zero-cost row as bad_cost', () => {
    const zeroCostRow = validated[4]; // row index 4 (0-based) = Price: 0
    expect(zeroCostRow.accepted).toBe(false);
    expect(zeroCostRow.rejectReason).toBe('bad_cost');
  });

  it('rejects the negative-cost row as bad_cost', () => {
    const negCostRow = validated[5]; // Price: -10
    expect(negCostRow.accepted).toBe(false);
    expect(negCostRow.rejectReason).toBe('bad_cost');
  });

  it('flags the unknown grade ("TPS A-") with a warning, never a rejection', () => {
    const unknownGradeRow = validated[3]; // Grade: 'TPS A-'
    expect(unknownGradeRow.accepted).toBe(true);
    expect(unknownGradeRow.warnings).toContain('grade_unmapped');
  });

  it('parses the masked quantity "200+" as a floor', () => {
    const maskedRow = validated[2];
    expect(maskedRow.accepted).toBe(true);
    expect(maskedRow.row.qty).toBe(200);
    expect(maskedRow.row.qtyIsFloor).toBe(true);
  });

  it('folds "Verizon" and "VZW" to the same carrier code, producing the same SKU', () => {
    const [verizonRow, vzwRow] = validated;
    expect(verizonRow.accepted).toBe(true);
    expect(vzwRow.accepted).toBe(true);
    expect(verizonRow.row.carrier).toBe('VZW');
    expect(vzwRow.row.carrier).toBe('VZW');
    // Same product/capacity/color/lock/grade + same folded carrier => same
    // variant natural key => same deterministic SKU, even though the source
    // rows spelled the carrier two different ways and carried different
    // qty/cost — this is exactly the collision the commit RPC's
    // GROUP BY (variant_id, location_id) last-wins step depends on.
    expect(verizonRow.row.sku).toBe(vzwRow.row.sku);
  });

  it('summarizeDryRun collapses the two carrier-synonym rows into one distinct SKU', () => {
    const summary = summarizeDryRun(validated);
    expect(summary.rowsTotal).toBe(7);
    expect(summary.rowsRejected).toBe(2); // zero-cost + negative-cost
    expect(summary.rowsAccepted).toBe(5);
    expect(summary.rejectsByReason.bad_cost).toBe(2);
    // 5 accepted rows but only 4 distinct SKUs: rows 1+2 (Verizon/VZW) collapse to one.
    expect(summary.distinctSkus).toBe(4);
  });
});

describe('validateRow — mandatory field rejection', () => {
  it('rejects a row missing make/model/capacity/warehouse as missing_mandatory', () => {
    const [result] = validateRows([
      {
        make: '',
        model: 'X',
        modelNumber: 'X-1',
        category: 'phones',
        capacity: '128GB',
        vendorGrade: 'DLS A',
        carrierRaw: 'ATT',
        lockRaw: 'Locked',
        costRaw: 100,
        currency: 'USD',
        qtyRaw: '5',
        warehouseCode: 'TX1',
      },
    ]);
    expect(result.accepted).toBe(false);
    expect(result.rejectReason).toBe('missing_mandatory');
  });

  it('rejects an unrecognized category as bad_category', () => {
    const [result] = validateRows([
      {
        make: 'Acme',
        model: 'X',
        modelNumber: 'X-1',
        category: 'gadgets',
        capacity: '128GB',
        vendorGrade: 'DLS A',
        carrierRaw: 'ATT',
        lockRaw: 'Locked',
        costRaw: 100,
        currency: 'USD',
        qtyRaw: '5',
        warehouseCode: 'TX1',
      },
    ]);
    expect(result.accepted).toBe(false);
    expect(result.rejectReason).toBe('bad_category');
  });

  it('rejects unparseable quantity as bad_qty', () => {
    const [result] = validateRows([
      {
        make: 'Acme',
        model: 'X',
        modelNumber: 'X-1',
        category: 'phones',
        capacity: '128GB',
        vendorGrade: 'DLS A',
        carrierRaw: 'ATT',
        lockRaw: 'Locked',
        costRaw: 100,
        currency: 'USD',
        qtyRaw: 'lots',
        warehouseCode: 'TX1',
      },
    ]);
    expect(result.accepted).toBe(false);
    expect(result.rejectReason).toBe('bad_qty');
  });
});
