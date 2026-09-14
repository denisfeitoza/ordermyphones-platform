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

/** UI language → BCP-47 locale for dates. Currency stays USD/en-US by design. */
export const LOCALE_FOR: Record<'en' | 'pt' | 'es', string> = { en: 'en-US', pt: 'pt-BR', es: 'es' };

/** Short date ("Sep 13, 2026" / "13 de set. de 2026") in the viewer's language. */
export function formatDate(iso: string, lang: 'en' | 'pt' | 'es' = 'en', style: 'short' | 'long' = 'short'): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(LOCALE_FOR[lang], { month: style === 'long' ? 'long' : 'short', day: 'numeric', year: 'numeric' });
}
