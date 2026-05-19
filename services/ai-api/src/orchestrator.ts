import { agentRegistry, type AgentCode } from './agents';
import { resolveCallerRole } from './lib/supabase';

const KIND_TO_AGENT: Record<string, AgentCode> = {
  suggest_quote: 'pricing-agent',
  triage_inventory: 'inventory-triage-agent',
  evaluate_tier: 'tier-classifier-agent',
  draft_ticket_reply: 'customer-support-agent',
};

export interface OrchestrateInput {
  jwt: string;
  kind: keyof typeof KIND_TO_AGENT;
  scope: Record<string, unknown>;
  options?: { maxCostUsd?: number; modelHint?: string };
}

export interface OrchestrateResult {
  proposalId: string;
  agentCode: AgentCode;
  summary: string;
  diff: { before: unknown; after: unknown };
  rationale: string;
  toolCalls: Array<{ name: string; argsSummary: string }>;
  costUsd: number;
  tokens: { input: number; output: number; cached: number };
}

/**
 * Hub-and-spoke router. See docs/ai/ORCHESTRATOR.md for the full contract.
 *
 * v1 wires the registry but stops short of executing model calls — the
 * Anthropic Agent SDK integration is finalized in Phase 2.
 */
export async function orchestrate(input: OrchestrateInput): Promise<OrchestrateResult> {
  const role = await resolveCallerRole(input.jwt);
  if (role !== 'admin' && role !== 'staff') {
    throw new Error(`forbidden_role:${role}`);
  }

  const agentCode = KIND_TO_AGENT[input.kind];
  if (!agentCode) {
    throw new Error(`unknown_kind:${input.kind}`);
  }

  const agent = agentRegistry[agentCode];
  return agent.run({
    scope: input.scope,
    options: input.options ?? {},
  });
}
