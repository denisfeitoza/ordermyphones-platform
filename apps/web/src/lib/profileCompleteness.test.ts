import { describe, expect, it } from 'vitest';
import { profileCompleteness, type ProfileForCompleteness } from './profileCompleteness';

const base: ProfileForCompleteness = {
  tier: 'consumer',
  display_name: null,
  phone: null,
  shippingAddress: null,
  hasTaxCertificate: false,
};

describe('profileCompleteness', () => {
  it('consumer denominator is 3 (no tax certificate field)', () => {
    const r = profileCompleteness({ ...base, tier: 'consumer' });
    expect(r.fields).toHaveLength(3);
    expect(r.fields.some((f) => f.key === 'tax_certificate')).toBe(false);
  });

  it('business tiers add the tax certificate field (denominator 4)', () => {
    for (const tier of ['retailer', 'wholesale', 'distributor'] as const) {
      const r = profileCompleteness({ ...base, tier });
      expect(r.fields).toHaveLength(4);
      expect(r.fields.some((f) => f.key === 'tax_certificate')).toBe(true);
    }
  });

  it('empty consumer profile is 0%', () => {
    expect(profileCompleteness({ ...base, tier: 'consumer' }).pct).toBe(0);
  });

  it('consumer with name + phone + address is 100%', () => {
    const r = profileCompleteness({
      ...base,
      tier: 'consumer',
      display_name: 'Ana',
      phone: '+1 555 0100',
      shippingAddress: { street: '1 Main St', city: 'Dallas', state: 'TX', zip: '75001' },
    });
    expect(r.pct).toBe(100);
    expect(r.missing).toHaveLength(0);
  });

  it('retailer missing only the certificate is 75%', () => {
    const r = profileCompleteness({
      tier: 'retailer',
      display_name: 'Store LLC',
      phone: '+1 555 0100',
      shippingAddress: { street: '1 Main St' },
      hasTaxCertificate: false,
    });
    expect(r.pct).toBe(75);
    expect(r.missing).toHaveLength(1);
    expect(r.missing[0].key).toBe('tax_certificate');
  });

  it('whitespace-only strings and empty objects do not count as filled', () => {
    const r = profileCompleteness({
      ...base,
      tier: 'consumer',
      display_name: '   ',
      phone: '',
      shippingAddress: {},
    });
    expect(r.pct).toBe(0);
  });

  it('null tier scores like consumer (no certificate asked)', () => {
    const r = profileCompleteness({ ...base, tier: null });
    expect(r.fields).toHaveLength(3);
  });

  it('a filled tax certificate counts toward business completeness', () => {
    const r = profileCompleteness({
      tier: 'wholesale',
      display_name: 'Distro',
      phone: '+1 555 0100',
      shippingAddress: { street: '1 Main St' },
      hasTaxCertificate: true,
    });
    expect(r.pct).toBe(100);
  });
});
