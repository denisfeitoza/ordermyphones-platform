/**
 * Strips PII fields from any record before it enters a prompt or a log line.
 * Keys are matched case-insensitively against a hard-coded denylist; nested
 * objects and arrays are walked recursively.
 *
 * See docs/security/DATA-CLASSIFICATION.md.
 */

const PII_KEYS = new Set<string>([
  'email',
  'phone',
  'address',
  'street',
  'postal_code',
  'zip',
  'tax_id',
  'cpf',
  'cnpj',
  'ein',
  'legal_name',
  'first_name',
  'last_name',
  'full_name',
  'display_name',
  'date_of_birth',
  'ip',
]);

const REDACTED = '<redacted>';

export function redact<T>(value: T): T {
  return walk(value) as T;
}

function walk(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(walk);
  if (typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (PII_KEYS.has(k.toLowerCase())) {
      out[k] = REDACTED;
    } else {
      out[k] = walk(v);
    }
  }
  return out;
}
