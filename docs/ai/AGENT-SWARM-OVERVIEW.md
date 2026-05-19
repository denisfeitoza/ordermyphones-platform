# Agent Swarm — Overview

> AI is not a feature of this Platform — it is an **operator that executes native actions** inside the Platform on the user's behalf (developer standard §8 and §15). This document is the design contract for the swarm; agents are detailed in [`AGENTS-ROSTER.md`](AGENTS-ROSTER.md), the orchestrator in [`ORCHESTRATOR.md`](ORCHESTRATOR.md), and guardrails in [`EVAL-AND-GUARDRAILS.md`](EVAL-AND-GUARDRAILS.md).

## 1. Principles

1. **Propose, then apply.** No agent mutates production state directly. Agents emit structured **proposals** to `ai_actions` (see [`../architecture/DATA-MODEL.md`](../architecture/DATA-MODEL.md)); an admin (or an automated rule on a narrow whitelist) approves them; the Platform applies the action and writes `audit_log`.
2. **Bounded tools.** Every agent has the smallest tool set required for its role. No god agents.
3. **Server-side validation always.** Every tool call is validated against business invariants before the Platform applies it — even if the agent proposes it.
4. **Audit-first.** Every proposal and every applied action is in `ai_actions` and `audit_log` with `before/after`.
5. **Reversible where possible.** Actions carry `rollback_metadata`. Irreversible actions are explicitly flagged in the admin UI.
6. **No personally-identifiable customer data in prompts** beyond what is strictly necessary. Tickets, messages, and account numbers go through a redaction layer that strips PII keys before the prompt is constructed.
7. **Prompt caching by default.** Static system prompts and the catalog/pricing brief are cached via Anthropic prompt caching to keep cost stable.

## 2. Service surface

- **Service:** [`services/ai-api/`](../../services/ai-api/) — Node 20+, TypeScript.
- **Framework:** [`@anthropic-ai/claude-agent-sdk`](https://github.com/anthropics/claude-agent-sdk) (per developer standard §15.3). Mandatory.
- **Gateway:** Anthropic API as primary; OpenRouter as fallback gateway for model availability (developer standard §9).
- **Inbound:** HTTPS via the reverse proxy at `/ai/*`. Authenticated by the admin's Supabase JWT (admin/staff only). The storefront does **not** call this service directly.
- **Outbound:**
  - Supabase via `service_role` (reads only by default; writes only when explicitly permitted by a proposal-approval flow).
  - Anthropic / OpenRouter APIs for model calls.
  - Supplier adapters via a small internal RPC.

## 3. Agents at a glance (v1)

| Agent | Trigger | Tools |
|---|---|---|
| `pricing-agent` | Admin "Suggest quote", new RFQ ticket | read prices, read variant inventory, propose `price_rule` |
| `inventory-triage-agent` | Sync run flags discrepancies / low stock | read `inventory_snapshots`, read `orders`, propose `inventory_adjustment` (rare), draft Slack note (admin-only) |
| `tier-classifier-agent` | After paid order + nightly sweep | read `accounts`, `orders`, propose `tier_override` |
| `customer-support-agent` | New `tickets` row | read ticket history, read account, **draft** a `ticket_messages` entry (`author_kind='ai_draft'`); never sends |

Full roster, including tool-by-tool surfaces and prompts, lives in [`AGENTS-ROSTER.md`](AGENTS-ROSTER.md).

## 4. Orchestrator

A single orchestrator routes inbound requests to the right agent, manages the conversation thread, and handles handoffs. See [`ORCHESTRATOR.md`](ORCHESTRATOR.md).

## 5. MCP integration

Reusable, scoped MCP servers are the agent's tools:

- **`omp-mcp-platform`** — reads `accounts`, `orders`, `inventory_snapshots`, `prices`. Writes only through `propose_action`.
- **`omp-mcp-suppliers`** — reads supplier sync state and raw responses for forensic queries.
- **External MCPs (off-by-default):** Supabase MCP (admin-only during dev), Stripe MCP (admin-only during dev). Production agents do **not** load these.

## 6. Identity, memory, audit

- **Per-agent identity** lives in the application (no DB row), surfaced in `ai_actions.agent_code` and `audit_log.actor_kind = 'ai_agent'`.
- **Conversation memory** is bounded by ticket / proposal scope; long-term memory is read from the database, not stored in the model.
- **Per-account memory** (e.g. "this account prefers expedited shipping") lives in `accounts.preferences (jsonb)` and is loaded into the prompt by the orchestrator on demand.

## 7. Compose with the platform

```
Admin clicks "Suggest action"
        │
        ▼
apps/web ── /ai/route ──▶ services/ai-api (orchestrator)
                                │
                                ▼
                       Agent call (Agent SDK)
                                │
                                ▼
                  MCP tool calls (read-only by default)
                                │
                                ▼
                  Structured proposal {action,args,rationale,rollback}
                                │
                                ▼
        INSERT ai_actions (status='proposed')
                                │
                                ▼
              Admin UI shows proposal + Approve/Reject
                                │
                                ▼
        Admin approves ──▶ Server applies action ──▶ audit_log
```

## 8. Operating envelope at launch (v1)

- **Active agents:** 4 (pricing, inventory triage, tier classifier, customer support).
- **Autonomous actions (no admin approval) allowed:** **none** at launch. Everything is supervised. The autonomous whitelist is part of the maintenance phase.
- **Models:** Anthropic Claude family for reasoning + tool use. Cheaper model for drafting customer-support replies.
- **Cost ceiling:** monthly cap configurable per agent; the orchestrator refuses to fire calls once the cap is hit.

## 9. Out of scope for v1

- Customer-facing AI chat on the storefront.
- Autonomous pricing changes without admin approval.
- Generative product copy at scale (manual content for launch).
- Agent-to-agent open-ended collaboration; v1 uses a hub-and-spoke orchestrator only.
- Long-term semantic memory beyond `accounts.preferences`.

## 10. References

- [`ORCHESTRATOR.md`](ORCHESTRATOR.md)
- [`AGENTS-ROSTER.md`](AGENTS-ROSTER.md)
- [`EVAL-AND-GUARDRAILS.md`](EVAL-AND-GUARDRAILS.md)
- [`../architecture/AUTH-AND-RLS.md`](../architecture/AUTH-AND-RLS.md) — why agents cannot bypass RLS.
- [`../security/THREAT-MODEL.md`](../security/THREAT-MODEL.md) — AI-specific threats.
