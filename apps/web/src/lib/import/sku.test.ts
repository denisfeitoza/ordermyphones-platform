import { describe, expect, it } from 'vitest';
import { makeSku } from './sku';

// SKU shape: MODEL-CAP-COLOR-GRADE-CARRIER-LOCK. Color is part of the key so
// two variants differing only by color get distinct SKUs (the real HYLA bug).
describe('makeSku', () => {
  it('preserves the grade suffix (+ -> P, - -> M) — the collision-preventing bug', () => {
    const plusSku = makeSku('Testphone X', '256GB', 'Black', 'DLS B+', 'ATT', 'locked');
    const bareSku = makeSku('Testphone X', '256GB', 'Black', 'DLS B', 'ATT', 'locked');
    expect(plusSku).not.toBe(bareSku);
    expect(plusSku).toBe('TESTPHONEX-256GB-BLACK-DLSBP-ATT-L');
    expect(bareSku).toBe('TESTPHONEX-256GB-BLACK-DLSB-ATT-L');
  });

  it('encodes a trailing minus as M', () => {
    const sku = makeSku('Testphone X', '256GB', 'White', 'TPS A-', 'UNL', 'unlocked');
    expect(sku).toBe('TESTPHONEX-256GB-WHITE-TPSAM-UNL-U');
  });

  it('gives two variants differing only by color distinct SKUs', () => {
    const black = makeSku('Pixel 8', '128GB', 'Black', 'DLS B', 'OTH', 'locked');
    const white = makeSku('Pixel 8', '128GB', 'White', 'DLS B', 'OTH', 'locked');
    expect(black).not.toBe(white);
    expect(black).toBe('PIXEL8-128GB-BLACK-DLSB-OTH-L');
    expect(white).toBe('PIXEL8-128GB-WHITE-DLSB-OTH-L');
  });

  it('is deterministic — same inputs always produce the same SKU', () => {
    const s1 = makeSku('iPhone 11 Pro Max', '256GB', 'Midnight', 'DLS B+', 'ATT', 'unlocked');
    const s2 = makeSku('iPhone 11 Pro Max', '256GB', 'Midnight', 'DLS B+', 'ATT', 'unlocked');
    expect(s1).toBe(s2);
  });

  it('strips non-alphanumeric characters from model, capacity, and color', () => {
    const sku = makeSku('iPhone 11 Pro Max', '256 GB', 'Space Gray', 'DLS AA+', 'VZW', 'locked');
    expect(sku).toBe('IPHONE11PROMAX-256GB-SPACEGRAY-DLSAAP-VZW-L');
  });

  it('maps lock status to L/U', () => {
    const locked = makeSku('X', '128GB', 'Black', 'DLS A', 'TMO', 'locked');
    const unlocked = makeSku('X', '128GB', 'Black', 'DLS A', 'TMO', 'unlocked');
    expect(locked.endsWith('-L')).toBe(true);
    expect(unlocked.endsWith('-U')).toBe(true);
  });

  it('treats missing color/capacity/grade as empty tokens, not "null" strings', () => {
    const sku = makeSku('X', null, null, null, 'OTH', 'unlocked');
    expect(sku).toBe('X----OTH-U');
  });

  it('is a pure function of its six inputs — same shape every time', () => {
    const sku = makeSku('iPhone 11', '256GB', 'Blue', 'DLS B', 'ATT', 'unlocked');
    expect(sku).toBe('IPHONE11-256GB-BLUE-DLSB-ATT-U');
  });
});
