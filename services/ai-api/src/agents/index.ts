import { pricingAgent } from './pricing-agent';
import { inventoryTriageAgent } from './inventory-triage-agent';
import { tierClassifierAgent } from './tier-classifier-agent';
import { customerSupportAgent } from './customer-support-agent';

export type AgentCode =
  | 'pricing-agent'
  | 'inventory-triage-agent'
  | 'tier-classifier-agent'
  | 'customer-support-agent';

export interface AgentRunInput {
  scope: Record<string, unknown>;
  options: { maxCostUsd?: number; modelHint?: string };
}

export interface AgentRunOutput {
  proposalId: string;
  agentCode: AgentCode;
  summary: string;
  diff: { before: unknown; after: unknown };
  rationale: string;
  toolCalls: Array<{ name: string; argsSummary: string }>;
  costUsd: number;
  tokens: { input: number; output: number; cached: number };
}

export interface Agent {
  code: AgentCode;
  description: string;
  run(input: AgentRunInput): Promise<AgentRunOutput>;
}

export const agentRegistry: Record<AgentCode, Agent> = {
  'pricing-agent': pricingAgent,
  'inventory-triage-agent': inventoryTriageAgent,
  'tier-classifier-agent': tierClassifierAgent,
  'customer-support-agent': customerSupportAgent,
};
