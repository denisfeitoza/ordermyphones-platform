import { describe, expect, it } from 'vitest';
import { makeSku } from './sku';

// SKU shape: MODELSLUG-MODELNUMBER-CAP-COLOR-GRADE-CARRIER-LOCK. model_number
// and color are both part of the key so two products sharing one model name
// across different model_numbers (the real HYLA bug: iPhone 15 Pro Max = A2849
// AND A3106), and two variants differing only by color, get distinct SKUs.
describe('makeSku', () => {
  it('gives two products sharing a model name but different model_numbers distinct SKUs — the real HYLA collision', () => {
    // iPhone 15 Pro Max ships as A2849 and A3106: same name, different products.
    const a2849 = makeSku('iPhone 15 Pro Max', 'A2849', '256GB', 'Blue', 'DLS B', 'ATT', 'unlocked');
    const a3106 = makeSku('iPhone 15 Pro Max', 'A3106', '256GB', 'Blue', 'DLS B', 'ATT', 'unlocked');
    expect(a2849).not.toBe(a3106);
    expect(a2849).toBe('IPHONE15PROMAX-A2849-256GB-BLUE-DLSB-ATT-U');
    expect(a3106).toBe('IPHONE15PROMAX-A3106-256GB-BLUE-DLSB-ATT-U');
  });

  it('preserves the grade suffix (+ -> P, - -> M) — the collision-preventing bug', () => {
    const plusSku = makeSku('Testphone X', 'A1234', '256GB', 'Black', 'DLS B+', 'ATT', 'locked');
    const bareSku = makeSku('Testphone X', 'A1234', '256GB', 'Black', 'DLS B', 'ATT', 'locked');
    expect(plusSku).not.toBe(bareSku);
    expect(plusSku).toBe('TESTPHONEX-A1234-256GB-BLACK-DLSBP-ATT-L');
    expect(bareSku).toBe('TESTPHONEX-A1234-256GB-BLACK-DLSB-ATT-L');
  });

  it('encodes a trailing minus as M', () => {
    const sku = makeSku('Testphone X', 'A1234', '256GB', 'White', 'TPS A-', 'UNL', 'unlocked');
    expect(sku).toBe('TESTPHONEX-A1234-256GB-WHITE-TPSAM-UNL-U');
  });

  it('gives two variants differing only by color distinct SKUs', () => {
    const black = makeSku('Pixel 8', 'GA123', '128GB', 'Black', 'DLS B', 'OTH', 'locked');
    const white = makeSku('Pixel 8', 'GA123', '128GB', 'White', 'DLS B', 'OTH', 'locked');
    expect(black).not.toBe(white);
    expect(black).toBe('PIXEL8-GA123-128GB-BLACK-DLSB-OTH-L');
    expect(white).toBe('PIXEL8-GA123-128GB-WHITE-DLSB-OTH-L');
  });

  it('is deterministic — same inputs always produce the same SKU', () => {
    const s1 = makeSku('iPhone 11 Pro Max', 'A2161', '256GB', 'Midnight', 'DLS B+', 'ATT', 'unlocked');
    const s2 = makeSku('iPhone 11 Pro Max', 'A2161', '256GB', 'Midnight', 'DLS B+', 'ATT', 'unlocked');
    expect(s1).toBe(s2);
  });

  it('strips non-alphanumeric characters from model, model_number, capacity, and color', () => {
    const sku = makeSku('iPhone 11 Pro Max', 'A21 6-1', '256 GB', 'Space Gray', 'DLS AA+', 'VZW', 'locked');
    expect(sku).toBe('IPHONE11PROMAX-A2161-256GB-SPACEGRAY-DLSAAP-VZW-L');
  });

  it('maps lock status to L/U', () => {
    const locked = makeSku('X', 'A100', '128GB', 'Black', 'DLS A', 'TMO', 'locked');
    const unlocked = makeSku('X', 'A100', '128GB', 'Black', 'DLS A', 'TMO', 'unlocked');
    expect(locked.endsWith('-L')).toBe(true);
    expect(unlocked.endsWith('-U')).toBe(true);
  });

  it('treats missing model_number/color/capacity/grade as empty tokens, not "null" strings', () => {
    const sku = makeSku('X', null, null, null, null, 'OTH', 'unlocked');
    expect(sku).toBe('X-----OTH-U');
  });

  it('is a pure function of its seven inputs — same shape every time', () => {
    const sku = makeSku('iPhone 11', 'A2111', '256GB', 'Blue', 'DLS B', 'ATT', 'unlocked');
    expect(sku).toBe('IPHONE11-A2111-256GB-BLUE-DLSB-ATT-U');
  });
});
