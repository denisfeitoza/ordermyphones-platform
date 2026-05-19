import { supabaseAdmin } from '../lib/supabase';
import type { PricingTierCode } from '@shared/pricing';

/**
 * Scoped MCP-style tools exposed to the agent swarm. All tools default to
 * **read-only**. Writes go exclusively through `propose_action`, which
 * inserts into `ai_actions` for admin review — never mutates business state.
 *
 * See docs/ai/AGENT-SWARM-OVERVIEW.md and docs/architecture/AUTH-AND-RLS.md.
 */

export async function read_account(accountId: string) {
  const { data, error } = await supabaseAdmin
    .from('accounts')
    .select('id, display_name, type, tier_id, cumulative_units_last_window, preferences, created_at')
    .eq('id', accountId)
    .single();
  if (error) throw new Error(`read_account:${error.message}`);
  return data;
}

export async function read_variant(variantId: string) {
  const { data, error } = await supabaseAdmin
    .from('product_variants')
    .select('id, product_id, sku, color, storage_gb, condition, attributes, products(id, slug, brand, model)')
    .eq('id', variantId)
    .single();
  if (error) throw new Error(`read_variant:${error.message}`);
  return data;
}

export async function read_prices(variantId: string) {
  const { data, error } = await supabaseAdmin
    .from('prices')
    .select('variant_id, tier_id, price_cents, currency, tiers(code,label,position)')
    .eq('variant_id', variantId);
  if (error) throw new Error(`read_prices:${error.message}`);
  return data;
}

export async function read_inventory(variantId: string) {
  const { data, error } = await supabaseAdmin
    .from('inventory_snapshots')
    .select('id, variant_id, supplier_id, available_qty, unit_cost_cents, currency, as_of')
    .eq('variant_id', variantId)
    .order('as_of', { ascending: false })
    .limit(8);
  if (error) throw new Error(`read_inventory:${error.message}`);
  return data;
}

export interface ProposeActionInput {
  agentCode: string;
  targetTable: string;
  targetId: string;
  proposal: Record<string, unknown>;
  rationale: string;
  rollbackMetadata: Record<string, unknown>;
}

export async function propose_action(input: ProposeActionInput) {
  const { data, error } = await supabaseAdmin
    .from('ai_actions')
    .insert({
      agent_code: input.agentCode,
      target_table: input.targetTable,
      target_id: input.targetId,
      proposal: input.proposal,
      rationale: input.rationale,
      rollback_metadata: input.rollbackMetadata,
      status: 'proposed',
    })
    .select('id')
    .single();
  if (error) throw new Error(`propose_action:${error.message}`);
  return data;
}

export type TierThresholds = Array<{ code: PricingTierCode; minUnits: number; maxUnits: number | null }>;
