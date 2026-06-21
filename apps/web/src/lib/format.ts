const usd2 = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const usd0 = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Integer cents → USD string. Money is integer cents end-to-end; no float math here. */
export function formatUsd(cents: number, whole = false): string {
  if (!Number.isFinite(cents)) return '—';
  return (whole ? usd0 : usd2).format(cents / 100);
}

export function formatInt(n: number): string {
  return n.toLocaleString('en-US');
}
