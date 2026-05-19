import type { Agent, AgentRunInput, AgentRunOutput } from './index';

export const pricingAgent: Agent = {
  code: 'pricing-agent',
  description:
    'Proposes tier-aware quotes and time-bound promotions that respect business invariants (margin floor, max discount, expiry).',
  async run(_input: AgentRunInput): Promise<AgentRunOutput> {
    // v1 stub. The Phase 2 implementation wires:
    //   - @anthropic-ai/claude-agent-sdk session
    //   - bounded MCP tools: read_account, read_variant, read_inventory,
    //     read_pricing_floors, propose_action
    //   - server-side validation of every proposal before insert.
    //
    // See docs/ai/AGENTS-ROSTER.md §1.
    throw new Error('pricing-agent: not implemented in scaffold');
  },
};
