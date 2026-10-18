/** Largest unit price an admin can type: $1,000,000.00. */
export const MAX_PRICE_CENTS = 100_000_000;

/**
 * Typed dollar amount → integer cents. Exactly one optional decimal mark
 * ("." or ",") with 1–2 digits after it: "1299", "1299.5", "1299,50".
 * Anything with a thousands separator ("1,299.00", "1.299,00", "1,299") is
 * refused instead of guessed, so it can never be read as $1.30. A leading
 * "$" and spaces are ignored. Returns null for empty, zero, malformed or
 * above MAX_PRICE_CENTS.
 */
export function parseMoneyToCents(input: string): number | null {
  const s = input.trim().replace(/^\$\s*/, '');
  const m = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const cents = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || 0);
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > MAX_PRICE_CENTS) return null;
  return cents;
}
