import { describe, expect, it } from 'vitest';
import { normalizeCapacity, normalizeCarrier, normalizeCostCents, normalizeLockStatus, normalizeQuantity } from './normalize';

describe('normalizeCarrier', () => {
  it('folds "Verizon" and "VZW" to the same canonical code', () => {
    expect(normalizeCarrier('Verizon').code).toBe('VZW');
    expect(normalizeCarrier('VZW').code).toBe('VZW');
  });

  it('accepts a bare canonical code unchanged', () => {
    expect(normalizeCarrier('ATT').code).toBe('ATT');
  });

  it('folds an unmapped raw value to OTH and flags it as unmapped', () => {
    const result = normalizeCarrier('Some Exotic MVNO');
    expect(result.code).toBe('OTH');
    expect(result.unmapped).toBe(true);
  });

  it('does not flag an already-OTH/blank value as unmapped', () => {
    expect(normalizeCarrier('OTH').unmapped).toBe(false);
    expect(normalizeCarrier('').unmapped).toBe(false);
    expect(normalizeCarrier(null).unmapped).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(normalizeCarrier('verizon').code).toBe('VZW');
    expect(normalizeCarrier('unlocked').code).toBe('UNL');
  });
});

describe('normalizeQuantity', () => {
  it('parses a masked quantity "200+" as a floor', () => {
    expect(normalizeQuantity('200+')).toEqual({ qty: 200, isFloor: true });
  });

  it('parses a plain integer as an exact count', () => {
    expect(normalizeQuantity('47')).toEqual({ qty: 47, isFloor: false });
  });

  it('parses zero as an exact count (delist target)', () => {
    expect(normalizeQuantity('0')).toEqual({ qty: 0, isFloor: false });
  });

  it('rejects non-numeric garbage', () => {
    expect(normalizeQuantity('N/A')).toBeNull();
    expect(normalizeQuantity('-5')).toBeNull();
    expect(normalizeQuantity(null)).toBeNull();
  });

  it('tolerates surrounding whitespace on the masked form', () => {
    expect(normalizeQuantity(' 200 + ')).toEqual({ qty: 200, isFloor: true });
  });
});

describe('normalizeCostCents', () => {
  it('converts a plain dollar amount to integer cents', () => {
    expect(normalizeCostCents('127.50')).toBe(12750);
    expect(normalizeCostCents('$127.50')).toBe(12750);
  });

  it('handles US-style thousands separators', () => {
    expect(normalizeCostCents('1,234.56')).toBe(123456);
  });

  it('handles EU-style thousands/decimal separators', () => {
    expect(normalizeCostCents('1.234,56')).toBe(123456);
  });

  it('rejects zero', () => {
    expect(normalizeCostCents('0')).toBeNull();
    expect(normalizeCostCents(0)).toBeNull();
  });

  it('rejects negative amounts', () => {
    expect(normalizeCostCents('-10')).toBeNull();
    expect(normalizeCostCents(-10)).toBeNull();
  });

  it('rejects blank/missing', () => {
    expect(normalizeCostCents(null)).toBeNull();
    expect(normalizeCostCents('')).toBeNull();
  });
});

describe('normalizeCapacity', () => {
  it('tidies "256 GB" to "256GB"', () => {
    expect(normalizeCapacity('256 GB')).toBe('256GB');
  });

  it('converts TB to GB', () => {
    expect(normalizeCapacity('0.5TB')).toBe('512GB');
    expect(normalizeCapacity('1TB')).toBe('1024GB');
  });

  it('passes through an already-clean value', () => {
    expect(normalizeCapacity('64GB')).toBe('64GB');
  });
});

describe('normalizeLockStatus', () => {
  it('maps a "lock%"-prefixed raw value to locked', () => {
    expect(normalizeLockStatus('Locked')).toBe('locked');
    expect(normalizeLockStatus('LOCK')).toBe('locked');
  });

  it('defaults everything else, including blank, to unlocked', () => {
    expect(normalizeLockStatus('Unlocked')).toBe('unlocked');
    expect(normalizeLockStatus('')).toBe('unlocked');
    expect(normalizeLockStatus(null)).toBe('unlocked');
  });
});
