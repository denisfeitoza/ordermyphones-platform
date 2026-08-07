import type { DbTier } from '@/lib/invites';
import { isBusinessTier } from '@/lib/invites';

/**
 * Profile-completeness meter for Portal → Settings (REGISTRATION-FIELDS.md:
 * "A profile-completeness checklist nudges without blocking"). This is a pure,
 * UI-agnostic scorer so it can be unit-tested (vitest runs node-env *.test.ts).
 *
 * It scores the gates that matter operationally, per tier:
 *   - display_name   (G0, always)
 *   - phone          (G1, always — delivery contact)
 *   - shippingAddress (G1, always — physically required to ship)
 *   - taxCertificate (G2, business tiers only — Retailer/Wholesale/Distributor)
 *
 * Consumer accounts are not asked for a tax certificate, so their denominator
 * is 3, not 4 — the meter reaches 100% without a field that never applies.
 */
export interface ProfileForCompleteness {
  tier: DbTier | null;
  display_name: string | null;
  phone: string | null;
  shippingAddress: unknown | null;
  /** true once a certificate object exists in the tax-certificates bucket. */
  hasTaxCertificate: boolean;
}

export interface CompletenessField {
  key: 'display_name' | 'phone' | 'shipping_address' | 'tax_certificate';
  /** English label (also a t() key). */
  label: string;
  done: boolean;
}

export interface CompletenessResult {
  /** Integer 0–100. */
  pct: number;
  fields: CompletenessField[];
  missing: CompletenessField[];
}

function filled(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'object') return Object.keys(v as object).length > 0;
  return true;
}

export function profileCompleteness(p: ProfileForCompleteness): CompletenessResult {
  const fields: CompletenessField[] = [
    { key: 'display_name', label: 'Name', done: filled(p.display_name) },
    { key: 'phone', label: 'Phone number', done: filled(p.phone) },
    { key: 'shipping_address', label: 'Shipping address', done: filled(p.shippingAddress) },
  ];

  // G2 tax certificate only applies to business tiers. A null tier (not yet
  // assigned) is treated as consumer-equivalent for scoring — no cert asked.
  if (p.tier && isBusinessTier(p.tier)) {
    fields.push({ key: 'tax_certificate', label: 'Tax certificate', done: p.hasTaxCertificate });
  }

  const done = fields.filter((f) => f.done).length;
  const pct = Math.round((done / fields.length) * 100);
  return { pct, fields, missing: fields.filter((f) => !f.done) };
}
