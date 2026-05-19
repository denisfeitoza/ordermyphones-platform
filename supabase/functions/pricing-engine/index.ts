// supabase/functions/pricing-engine/index.ts
// Deno runtime. Tier-aware cart pricing.
// Contract: docs/architecture/PRICING-ENGINE.md.

// deno-lint-ignore-file no-explicit-any
// @ts-nocheck — Deno globals are not in this TS server config; resolved at deploy time.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

interface CartItemInput { variant_id: string; qty: number }
interface RequestBody {
  customer_account_id: string | null;
  cart: CartItemInput[];
  currency: 'USD';
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

serve(async (req) => {
  if (req.method !== 'POST') return new Response('method_not_allowed', { status: 405 });

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  // ---------- Input validation (server-side; never trust the client) ----------
  if (!Array.isArray(body?.cart) || body.cart.length === 0) {
    return json({ error: 'empty_cart' }, 400);
  }
  for (const line of body.cart) {
    if (!line.variant_id || !Number.isInteger(line.qty) || line.qty < 1) {
      return json({ error: 'invalid_line', detail: line }, 400);
    }
  }
  if (body.currency !== 'USD') {
    return json({ error: 'unsupported_currency' }, 400);
  }

  // ---------- Tier resolution ----------
  const { data: tiers, error: tiersErr } = await supabase
    .from('tiers')
    .select('id, code, label, min_units, max_units, position')
    .order('position', { ascending: true });
  if (tiersErr || !tiers?.length) return json({ error: 'tiers_missing' }, 500);

  let storedTierCode: string | null = null;
  if (body.customer_account_id) {
    const { data: acct } = await supabase
      .from('accounts')
      .select('tier_id, tiers(code)')
      .eq('id', body.customer_account_id)
      .single();
    storedTierCode = (acct as any)?.tiers?.code ?? null;
  }

  const cartUnitCount = body.cart.reduce((s, l) => s + l.qty, 0);
  const cartTier = tiers.find((t) => cartUnitCount >= t.min_units && (t.max_units === null || cartUnitCount <= t.max_units)) ?? tiers[0];
  const storedTier = storedTierCode ? tiers.find((t) => t.code === storedTierCode) : null;

  const effectiveTier =
    storedTier && storedTier.position > cartTier.position ? storedTier : cartTier;

  // ---------- Per-line pricing ----------
  const lines: any[] = [];
  let subtotalCents = 0;

  for (const line of body.cart) {
    const { data: price, error: priceErr } = await supabase
      .from('prices')
      .select('price_cents, currency')
      .eq('variant_id', line.variant_id)
      .eq('tier_id', effectiveTier.id)
      .single();
    if (priceErr || !price) {
      return json({ error: 'price_missing', detail: { variant_id: line.variant_id, tier: effectiveTier.code } }, 400);
    }
    if (price.price_cents < 1) {
      return json({ error: 'invalid_price_in_db', detail: line.variant_id }, 500);
    }
    const lineTotal = price.price_cents * line.qty;
    lines.push({
      variant_id: line.variant_id,
      qty: line.qty,
      unit_price_cents: price.price_cents,
      line_total_cents: lineTotal,
      applied_rule_id: null,
    });
    subtotalCents += lineTotal;
  }

  return json({
    effective_tier: { id: effectiveTier.id, code: effectiveTier.code, label: effectiveTier.label },
    lines,
    subtotal_cents: subtotalCents,
    currency: 'USD',
    diagnostics: {
      stored_tier_code: storedTierCode,
      cart_unit_count: cartUnitCount,
      promotions_applied: [],
    },
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
