import type { Agent, AgentRunInput, AgentRunOutput } from './index';

export const inventoryTriageAgent: Agent = {
  code: 'inventory-triage-agent',
  description:
    'Consolidates supplier discrepancies, flags low-stock SKUs, and suggests next-best actions (re-order, re-price, pause, contact supplier).',
  async run(_input: AgentRunInput): Promise<AgentRunOutput> {
    // See docs/ai/AGENTS-ROSTER.md §2.
    throw new Error('inventory-triage-agent: not implemented in scaffold');
  },
};
