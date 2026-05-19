import type { AgentCode } from '../agents';

/**
 * Per-agent budgets (v1 defaults). See docs/ai/AGENTS-ROSTER.md §6.
 * Values intentionally conservative; tuned in Phase 4.
 */
export interface AgentBudget {
  maxToolCallsPerRequest: number;
  dailyInvocationsCap: number;
  maxCostUsdPerRequest: number;
}

export const AGENT_BUDGETS: Record<AgentCode, AgentBudget> = {
  'pricing-agent':           { maxToolCallsPerRequest: 8,  dailyInvocationsCap: 1_000, maxCostUsdPerRequest: 0.20 },
  'inventory-triage-agent':  { maxToolCallsPerRequest: 12, dailyInvocationsCap: 200,   maxCostUsdPerRequest: 0.50 },
  'tier-classifier-agent':   { maxToolCallsPerRequest: 6,  dailyInvocationsCap: 500,   maxCostUsdPerRequest: 0.15 },
  'customer-support-agent':  { maxToolCallsPerRequest: 8,  dailyInvocationsCap: 2_000, maxCostUsdPerRequest: 0.10 },
};

export function clampRequestBudget(agent: AgentCode, requested?: number): number {
  const ceiling = AGENT_BUDGETS[agent].maxCostUsdPerRequest;
  const requestedSafe = Number.isFinite(requested) ? Math.max(0, requested!) : ceiling;
  return Math.min(requestedSafe, ceiling);
}
