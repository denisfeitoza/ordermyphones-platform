import { supabase } from './supabase';
import type { PricingEngineInput, PricingEngineOutput } from '@shared/pricing';

/**
 * Calls the `pricing-engine` Supabase edge function. Server-side validation
 * is the source of truth — this function is a thin typed client.
 *
 * See: docs/architecture/PRICING-ENGINE.md
 */
export async function quoteCart(input: PricingEngineInput): Promise<PricingEngineOutput> {
  const { data, error } = await supabase.functions.invoke<PricingEngineOutput>('pricing-engine', {
    body: input,
  });
  if (error) throw new Error(`pricing-engine: ${error.message}`);
  if (!data) throw new Error('pricing-engine returned no data');
  return data;
}

/**
 * Format integer cents as a localized USD string.
 * Money is integer cents end-to-end; no float math touches this path.
 */
const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCents(cents: number): string {
  if (!Number.isFinite(cents)) return '—';
  return usdFormatter.format(cents / 100);
}
