import type { Agent, AgentRunInput, AgentRunOutput } from './index';

export const customerSupportAgent: Agent = {
  code: 'customer-support-agent',
  description:
    'Drafts replies to customer tickets. Always writes as author_kind="ai_draft" — never sends. Financial commitments are tagged for admin review.',
  async run(_input: AgentRunInput): Promise<AgentRunOutput> {
    // See docs/ai/AGENTS-ROSTER.md §4.
    throw new Error('customer-support-agent: not implemented in scaffold');
  },
};
