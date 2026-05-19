// supabase/functions/tier-upgrade/index.ts
// Cumulative-units lifecycle. Re-evaluates tier per account.
// Contract: docs/architecture/PRICING-ENGINE.md §5.

// @ts-nocheck — Deno runtime
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SHARED_SECRET = Deno.env.get('TIER_UPGRADE_SHARED_SECRET') ?? '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const WINDOW_MONTHS = 12;
const DEMOTION_GRACE_DAYS = 30;

serve(async (req) => {
  if (req.method !== 'POST') return new Response('method_not_allowed', { status: 405 });

  // Service-to-service auth via shared secret (no JWT).
  const auth = req.headers.get('authorization') ?? '';
  if (SHARED_SECRET && auth !== `Bearer ${SHARED_SECRET}`) {
    return new Response('forbidden', { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const accountId = body?.account_id;
  if (!accountId) return new Response('account_id_required', { status: 400 });

  // Cumulative units in window.
  const since = new Date(Date.now() - WINDOW_MONTHS * 30 * 24 * 3600 * 1000).toISOString();
  const { data: items, error } = await supabase
    .from('order_items')
    .select('qty, orders!inner(status, account_id, created_at)')
    .eq('orders.account_id', accountId)
    .gte('orders.created_at', since)
    .in('orders.status', ['paid', 'fulfilling', 'shipped', 'delivered']);
  if (error) return new Response(`db_error:${error.message}`, { status: 500 });

  const totalUnits = (items ?? []).reduce((s: number, r: any) => s + (r.qty ?? 0), 0);

  // Map units → tier.
  const { data: tiers } = await supabase
    .from('tiers')
    .select('id, code, min_units, max_units, position')
    .order('position', { ascending: true });
  if (!tiers?.length) return new Response('tiers_missing', { status: 500 });

  const nextTier =
    tiers.find((t: any) => totalUnits >= t.min_units && (t.max_units === null || totalUnits <= t.max_units)) ?? tiers[0];

  const { data: acct } = await supabase
    .from('accounts')
    .select('tier_id, cumulative_units_last_window')
    .eq('id', accountId)
    .single();

  if (!acct) return new Response('account_not_found', { status: 404 });

  // Promotion is immediate; demotion respects DEMOTION_GRACE_DAYS.
  const promoting = !acct.tier_id || tierPosition(tiers, nextTier.id) > tierPosition(tiers, acct.tier_id);
  if (acct.tier_id === nextTier.id) {
    return json({ changed: false, total_units: totalUnits });
  }

  if (!promoting) {
    // v1 returns "deferred" — admin or cron applies the demotion after the grace window.
    return json({
      changed: false,
      deferred: true,
      reason: `demotion_within_grace_${DEMOTION_GRACE_DAYS}d`,
      total_units: totalUnits,
    });
  }

  await supabase
    .from('accounts')
    .update({
      tier_id: nextTier.id,
      cumulative_units_last_window: totalUnits,
    })
    .eq('id', accountId);

  await supabase.from('audit_log').insert({
    actor_kind: 'system',
    action: 'tier.promote',
    target_table: 'accounts',
    target_id: accountId,
    before: { tier_id: acct.tier_id },
    after: { tier_id: nextTier.id, total_units: totalUnits },
  });

  return json({ changed: true, tier: nextTier.code, total_units: totalUnits });
});

function tierPosition(tiers: any[], id: string): number {
  return tiers.find((t) => t.id === id)?.position ?? 0;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
