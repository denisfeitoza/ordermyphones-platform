import { describe, expect, it } from 'vitest';
import { nextBand } from './tierProgress';

const bands = { retailer: 10, wholesale: 50, distributor: 401 };
describe('nextBand', () => {
  it('points at the next tier above the current one', () => {
    expect(nextBand({ units: 3, tier: 'consumer', volumeTier: 'consumer', bands })).toEqual({ tier: 'retailer', at: 10 });
    expect(nextBand({ units: 60, tier: 'wholesale', volumeTier: 'wholesale', bands })).toEqual({ tier: 'distributor', at: 401 });
  });
  it('is null at the top tier', () => {
    expect(nextBand({ units: 900, tier: 'distributor', volumeTier: 'distributor', bands })).toBeNull();
  });
});
