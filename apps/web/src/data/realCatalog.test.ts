import { describe, expect, it } from 'vitest';
import { buildDisplayName, carrierLabel } from './realCatalog';

describe('buildDisplayName', () => {
  it('renders the exact canonical example from the Phase 4 task spec', () => {
    const name = buildDisplayName({
      model: 'iPhone 11 Pro',
      capacity: '256GB',
      carrier: 'UNL',
      lockStatus: 'unlocked',
    });
    expect(name).toBe('iPhone 11 Pro · 256GB · Unlocked');
  });

  it('shows the carrier for a carrier-locked variant instead of "Unlocked"', () => {
    const name = buildDisplayName({
      model: 'iPhone 11',
      capacity: '64GB',
      carrier: 'ATT',
      lockStatus: 'locked',
    });
    expect(name).toBe('iPhone 11 · 64GB · AT&T Locked');
  });

  it('never renders "Unlocked" for a locked variant even when carrier is UNL', () => {
    // Not a real combination in practice (locked implies a real carrier),
    // but the function must not silently mislabel a locked device.
    const name = buildDisplayName({
      model: 'Test Phone',
      capacity: '128GB',
      carrier: 'UNL',
      lockStatus: 'locked',
    });
    expect(name).toContain('Locked');
    expect(name).not.toMatch(/· Unlocked$/);
  });
});

describe('carrierLabel', () => {
  it('maps known carrier codes to friendly labels', () => {
    expect(carrierLabel('ATT')).toBe('AT&T');
    expect(carrierLabel('VZW')).toBe('Verizon');
  });

  it('falls back to the raw code for an unrecognized carrier rather than throwing', () => {
    expect(carrierLabel('ZZZ')).toBe('ZZZ');
  });
});

describe('buildDisplayName — accessories and unknown carriers (audit 2026-09-13)', () => {
  it('hides the placeholder 1GB capacity accessories get from the phone import', () => {
    expect(buildDisplayName({ model: 'AirPods Max 2 USB-C', capacity: '1GB', carrier: 'OTH', lockStatus: 'locked' })).toBe(
      'AirPods Max 2 USB-C · Locked',
    );
  });
  it('says just "Locked" when the carrier is the catch-all OTH', () => {
    expect(buildDisplayName({ model: 'Galaxy S23', capacity: '128GB', carrier: 'OTH', lockStatus: 'locked' })).toBe('Galaxy S23 · 128GB · Locked');
  });
  it('keeps the named carrier for real carriers', () => {
    expect(buildDisplayName({ model: 'iPhone 11', capacity: '64GB', carrier: 'ATT', lockStatus: 'locked' })).toContain('Locked');
    expect(buildDisplayName({ model: 'iPhone 11', capacity: '64GB', carrier: 'ATT', lockStatus: 'locked' })).not.toBe('iPhone 11 · 64GB · Locked');
  });
});
