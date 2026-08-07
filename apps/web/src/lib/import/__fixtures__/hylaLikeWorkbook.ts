/**
 * SYNTHETIC fixture — NOT the real vendor file, no real supplier data (D16,
 * repo is public). Reproduces every edge case SMART-STOCK-IMPORT.md derived
 * from the real HYLA feed:
 *   - a decorative cover sheet ahead of the real data sheet
 *   - two rows that differ only by carrier spelling ("Verizon" vs "VZW"),
 *     which must fold to the same carrier code and collapse to one variant
 *   - a masked quantity ("200+")
 *   - a grade absent from any vendor_grade_map ("TPS A-")
 *   - zero-cost and negative-cost rows (must reject)
 *   - two warehouses (TX1, TN1)
 */
import * as XLSX from 'xlsx';
import type { RawImportRow } from '../types';

export interface FixtureRow {
  Make: string;
  Model: string;
  'Model Number': string;
  Category: string;
  Capacity: string;
  Color: string;
  Grade: string;
  Carrier: string;
  'Lock Status': string;
  Price: number | string;
  Currency: string;
  Quantity: string | number;
  Warehouse: string;
}

export const FIXTURE_ROWS: FixtureRow[] = [
  // Rows 1-2: same variant, carrier spelled two different ways.
  {
    Make: 'Acme', Model: 'Testphone X', 'Model Number': 'TX-1000', Category: 'Phones',
    Capacity: '256GB', Color: 'Black', Grade: 'DLS B+', Carrier: 'Verizon',
    'Lock Status': 'Unlocked', Price: 150, Currency: 'USD', Quantity: '10', Warehouse: 'TX1',
  },
  {
    Make: 'Acme', Model: 'Testphone X', 'Model Number': 'TX-1000', Category: 'Phones',
    Capacity: '256GB', Color: 'Black', Grade: 'DLS B+', Carrier: 'VZW',
    'Lock Status': 'Unlocked', Price: 155, Currency: 'USD', Quantity: '25', Warehouse: 'TX1',
  },
  // Row 3: masked quantity.
  {
    Make: 'Acme', Model: 'Testphone X', 'Model Number': 'TX-1000', Category: 'Phones',
    Capacity: '128GB', Color: 'White', Grade: 'DLS A', Carrier: 'ATT',
    'Lock Status': 'Locked', Price: 120, Currency: 'USD', Quantity: '200+', Warehouse: 'TX1',
  },
  // Row 4: unknown grade, orphan from any vendor grade map.
  {
    Make: 'Acme', Model: 'Testphone X', 'Model Number': 'TX-1000', Category: 'Phones',
    Capacity: '256GB', Color: 'Blue', Grade: 'TPS A-', Carrier: 'UNL',
    'Lock Status': 'Unlocked', Price: 200, Currency: 'USD', Quantity: '5', Warehouse: 'TN1',
  },
  // Row 5: zero cost — must reject.
  {
    Make: 'Acme', Model: 'Testphone X', 'Model Number': 'TX-1000', Category: 'Phones',
    Capacity: '256GB', Color: 'Red', Grade: 'DLS C', Carrier: 'OTH',
    'Lock Status': 'Unlocked', Price: 0, Currency: 'USD', Quantity: '3', Warehouse: 'TN1',
  },
  // Row 6: negative cost — must reject.
  {
    Make: 'Acme', Model: 'Testphone X', 'Model Number': 'TX-1000', Category: 'Phones',
    Capacity: '256GB', Color: 'Green', Grade: 'DLS C', Carrier: 'OTH',
    'Lock Status': 'Unlocked', Price: -10, Currency: 'USD', Quantity: '3', Warehouse: 'TN1',
  },
  // Row 7: second warehouse, second product, fully valid.
  {
    Make: 'Zenith', Model: 'Testdroid 9', 'Model Number': 'SD-9000', Category: 'Phones',
    Capacity: '64GB', Color: 'Black', Grade: 'TPS A+', Carrier: 'TMO',
    'Lock Status': 'Locked', Price: 80, Currency: 'USD', Quantity: '12', Warehouse: 'TN1',
  },
];

const HEADERS = Object.keys(FIXTURE_ROWS[0]) as Array<keyof FixtureRow>;

/** Bridges a fixture sheet row (already-mapped column names) straight to RawImportRow, bypassing map.ts. */
export function fixtureRowToRawImportRow(r: FixtureRow): RawImportRow {
  return {
    make: r.Make,
    model: r.Model,
    modelNumber: r['Model Number'],
    category: r.Category,
    capacity: r.Capacity,
    color: r.Color,
    vendorGrade: r.Grade,
    carrierRaw: r.Carrier,
    lockRaw: r['Lock Status'],
    costRaw: r.Price,
    currency: r.Currency,
    qtyRaw: r.Quantity,
    warehouseCode: r.Warehouse,
    warehouseName: null,
  };
}

/** Builds an in-memory .xlsx workbook: a decorative cover sheet + the real data sheet. */
export function buildHylaLikeWorkbook(): Uint8Array {
  const wb = XLSX.utils.book_new();

  const coverAoA: unknown[][] = [
    ['SYNTHETIC VENDOR DAILY STOCK REPORT'],
    ['Generated for testing purposes only — not real data'],
    [],
    ['Confidential — internal use'],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(coverAoA), 'Cover Page');

  const dataAoA: unknown[][] = [HEADERS, ...FIXTURE_ROWS.map((r) => HEADERS.map((h) => r[h]))];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dataAoA), 'New Availability');

  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}
