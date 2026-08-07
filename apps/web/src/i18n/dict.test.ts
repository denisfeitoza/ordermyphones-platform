import { describe, it, expect } from 'vitest';
import { PT, ES } from './dict';

/**
 * Trilingual coverage guard for customer-facing surfaces (Phase 8 QA).
 * Admin UI is English by design (DECISIONS-LOCKED #11), so it is NOT covered
 * here — only strings a customer can actually read on the storefront, cart,
 * checkout, portal orders, and invite/accept flow.
 *
 * A missing key falls back to English silently at runtime (index.tsx), so the
 * failure mode is "one language quietly stays English". These assertions turn
 * that silent gap into a red test.
 */

// Load-bearing customer strings that MUST be translated in both PT and ES.
const KEY_CUSTOMER_STRINGS = [
  // storefront + cart
  'Add to cart',
  'Browse catalog',
  'Menu',
  'Close',
  'Remove',
  'Decrease',
  'Increase',
  // checkout / order
  'Summary',
  'Total',
  'Shipping',
  'Ship to',
  'Qty',
  // portal orders
  'Back to orders',
  'Order not found',
  'No orders yet',
  'Approved',
  'unit',
  'units',
];

describe('i18n customer-string coverage', () => {
  it.each(KEY_CUSTOMER_STRINGS)('PT translates %j', (key) => {
    expect(PT[key], `missing PT translation for ${JSON.stringify(key)}`).toBeTruthy();
  });

  it.each(KEY_CUSTOMER_STRINGS)('ES translates %j', (key) => {
    expect(ES[key], `missing ES translation for ${JSON.stringify(key)}`).toBeTruthy();
  });

  it('PT and ES cover the exact same key set (no drift in either direction)', () => {
    const pt = new Set(Object.keys(PT));
    const es = new Set(Object.keys(ES));
    const onlyPt = [...pt].filter((k) => !es.has(k));
    const onlyEs = [...es].filter((k) => !pt.has(k));
    expect({ onlyPt, onlyEs }).toEqual({ onlyPt: [], onlyEs: [] });
  });
});
