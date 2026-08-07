/**
 * NORMALIZE stage (SMART-STOCK-IMPORT.md stage 3) — client-side preview
 * normalizers only. This is what powers the DRY-RUN screen (stage 5): it
 * turns raw mapped cells into the same canonical shape commit_stock_import
 * will compute, so the preview's accept/reject counts and price-impact
 * summary are trustworthy — but the RPC re-validates and re-normalizes
 * authoritatively at commit time; nothing here is trusted for the write.
 */
import type { CanonicalField } from './map';
import type { CarrierCode, LockStatus, RawImportRow } from './types';

const CARRIER_LABEL_TO_CODE: Record<string, CarrierCode> = {
  ATT: 'ATT',
  'AT&T': 'ATT',
  VZW: 'VZW',
  VERIZON: 'VZW',
  'T-MOBILE': 'TMO',
  TMO: 'TMO',
  SPRINT: 'SPR',
  BOOST: 'BST',
  SPECTRUM: 'SPC',
  XFINITY: 'XFI',
  UNL: 'UNL',
  UNLOCKED: 'UNL',
  OTH: 'OTH',
  OTHER: 'OTH',
  GENERIC: 'OTH',
  'XAA GENERIC': 'OTH',
  'XAG GENERIC': 'OTH',
  'WI-FI ONLY': 'OTH',
};

/**
 * Folds a raw carrier string to a canonical carrier code, using the same
 * built-in table the DB seed ships (plus any admin-added synonyms passed
 * in). Mirrors public.omp_fold_carrier's fallback shape: unknown -> OTH.
 */
export function normalizeCarrier(
  raw: string | null | undefined,
  extraSynonyms?: Map<string, CarrierCode>,
): { code: CarrierCode; unmapped: boolean } {
  const norm = String(raw ?? '').trim().toUpperCase();
  if (norm === '') return { code: 'OTH', unmapped: false };

  const CARRIER_CODE_SET = new Set(['ATT', 'VZW', 'TMO', 'SPR', 'BST', 'XFI', 'SPC', 'UNL', 'OTH']);
  if (CARRIER_CODE_SET.has(norm)) return { code: norm as CarrierCode, unmapped: false };

  const fromExtra = extraSynonyms?.get(norm);
  if (fromExtra) return { code: fromExtra, unmapped: false };

  const fromBuiltin = CARRIER_LABEL_TO_CODE[norm];
  if (fromBuiltin) return { code: fromBuiltin, unmapped: false };

  return { code: 'OTH', unmapped: true };
}

/** "200+" -> { qty: 200, isFloor: true }. Plain "200" -> { qty: 200, isFloor: false }. Anything else -> null (reject). */
export function normalizeQuantity(raw: string | number | null | undefined): { qty: number; isFloor: boolean } | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (/^\d+\s*\+\s*$/.test(s)) {
    return { qty: parseInt(s.replace(/\D/g, ''), 10), isFloor: true };
  }
  if (/^\d+$/.test(s)) {
    return { qty: parseInt(s, 10), isFloor: false };
  }
  return null;
}

/**
 * Money -> integer cents. Handles a leading "$", thousand separators in
 * either convention (1,234.56 or 1.234,56), and rejects (returns null) on
 * anything that isn't a positive number once cleaned — cost must be > 0.
 */
export function normalizeCostCents(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw <= 0) return null;
    return Math.round(raw * 100);
  }

  const s0 = raw.trim().replace(/\$/g, '').replace(/\s+/g, '');
  if (s0 === '') return null;
  // Cost must be strictly positive (never mints free/negative stock) — reject
  // outright rather than parsing the magnitude and re-applying the sign,
  // which would silently produce negative cents.
  if (s0.startsWith('-')) return null;

  let s = s0;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // Whichever separator appears last is the decimal point.
    if (lastComma > lastDot) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (lastComma > -1 && lastDot === -1) {
    // Only commas: thousands sep if 3-digit groups, else decimal sep.
    const parts = s.split(',');
    const looksLikeThousands = parts.slice(1).every((p) => p.length === 3);
    s = looksLikeThousands ? parts.join('') : s.replace(',', '.');
  }
  // else: only dots or no separators — leave as-is (standard decimal).

  const value = Number(s);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

/** "256 GB" / "256" / "0.5TB" -> "256GB" / "512GB". Verbatim passthrough for anything already tidy. */
export function normalizeCapacity(raw: string | null | undefined): string {
  const s = String(raw ?? '').trim();
  if (s === '') return '';
  const m = /^(\d+(?:\.\d+)?)\s*(gb|tb)$/i.exec(s);
  if (!m) return s.toUpperCase();
  const num = parseFloat(m[1]);
  const unit = m[2].toUpperCase();
  if (unit === 'TB') return `${Math.round(num * 1024)}GB`;
  return `${Math.round(num)}GB`;
}

export function normalizeLockStatus(raw: string | null | undefined): LockStatus {
  const s = String(raw ?? '').trim();
  return /^lock/i.test(s) ? 'locked' : 'unlocked';
}

export function normalizeColor(raw: string | null | undefined): string | null {
  const s = String(raw ?? '').trim();
  if (s === '' || s === '*') return null;
  return s;
}

/**
 * Applies the mapping (headers -> canonical field) to a single raw sheet
 * row, producing the flat RawImportRow shape normalize/validate consume.
 */
export function projectRow(
  row: Record<string, unknown>,
  columnToField: Map<string, CanonicalField>,
): RawImportRow {
  const get = (field: CanonicalField): unknown => {
    for (const [col, f] of columnToField) {
      if (f === field) return row[col];
    }
    return null;
  };
  const asString = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

  return {
    make: asString(get('make')),
    model: asString(get('model')),
    modelNumber: asString(get('model_number')),
    category: asString(get('category')),
    capacity: asString(get('capacity')),
    color: asString(get('color')),
    vendorGrade: asString(get('grade')),
    carrierRaw: asString(get('carrier')),
    lockRaw: asString(get('lock_status')),
    costRaw: get('cost') as string | number | null,
    currency: asString(get('currency')) ?? 'USD',
    qtyRaw: get('quantity') as string | number | null,
    warehouseCode: asString(get('warehouse')),
    warehouseName: null,
    description: asString(get('description')),
  };
}
