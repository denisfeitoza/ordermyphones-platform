import { describe, expect, it } from 'vitest';
import { makeSku } from './sku';

describe('makeSku', () => {
  it('preserves the grade suffix (+ -> P, - -> M) — the collision-preventing bug', () => {
    const plusSku = makeSku('Testphone X', '256GB', 'DLS B+', 'ATT', 'locked');
    const bareSku = makeSku('Testphone X', '256GB', 'DLS B', 'ATT', 'locked');
    expect(plusSku).not.toBe(bareSku);
    expect(plusSku).toBe('TESTPHONEX-256GB-DLSBP-ATT-L');
    expect(bareSku).toBe('TESTPHONEX-256GB-DLSB-ATT-L');
  });

  it('encodes a trailing minus as M', () => {
    const sku = makeSku('Testphone X', '256GB', 'TPS A-', 'UNL', 'unlocked');
    expect(sku).toBe('TESTPHONEX-256GB-TPSAM-UNL-U');
  });

  it('is deterministic — same inputs always produce the same SKU', () => {
    const s1 = makeSku('iPhone 11 Pro Max', '256GB', 'DLS B+', 'ATT', 'unlocked');
    const s2 = makeSku('iPhone 11 Pro Max', '256GB', 'DLS B+', 'ATT', 'unlocked');
    expect(s1).toBe(s2);
  });

  it('strips non-alphanumeric characters from model and capacity', () => {
    const sku = makeSku('iPhone 11 Pro Max', '256 GB', 'DLS AA+', 'VZW', 'locked');
    expect(sku).toBe('IPHONE11PROMAX-256GB-DLSAAP-VZW-L');
  });

  it('maps lock status to L/U', () => {
    const locked = makeSku('X', '128GB', 'DLS A', 'TMO', 'locked');
    const unlocked = makeSku('X', '128GB', 'DLS A', 'TMO', 'unlocked');
    expect(locked.endsWith('-L')).toBe(true);
    expect(unlocked.endsWith('-U')).toBe(true);
  });

  it('treats missing color/capacity/grade as empty tokens, not "null" strings', () => {
    const sku = makeSku('X', null, null, 'OTH', 'unlocked');
    expect(sku).toBe('X---OTH-U');
  });

  it('is a pure function of its five inputs — same shape every time', () => {
    const sku = makeSku('iPhone 11', '256GB', 'DLS B', 'ATT', 'unlocked');
    expect(sku).toBe('IPHONE11-256GB-DLSB-ATT-U');
  });
});
