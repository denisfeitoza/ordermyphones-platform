import type { Agent, AgentRunInput, AgentRunOutput } from './index';

export const tierClassifierAgent: Agent = {
  code: 'tier-classifier-agent',
  description:
    'Explains tier transitions and proposes manual overrides in unusual cases (VIP onboarding, momentary volume dip). Respects the grace period for demotions.',
  async run(_input: AgentRunInput): Promise<AgentRunOutput> {
    // See docs/ai/AGENTS-ROSTER.md §3.
    throw new Error('tier-classifier-agent: not implemented in scaffold');
  },
};
