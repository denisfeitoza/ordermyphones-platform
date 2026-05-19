# Orchestrator

> Hub-and-spoke router for the agent swarm. Lives at [`services/ai-api/src/orchestrator.ts`](../../services/ai-api/src/orchestrator.ts).

## 1. Responsibility

- Authenticate the inbound request (admin/staff JWT) and load the calling user's context.
- Decide **which agent** to dispatch to, given the request kind and the account snapshot.
- Manage the conversation thread for that request (single-turn for v1; multi-turn supported for tickets).
- Invoke the agent through the Anthropic Agent SDK with the right tools, prompts, and budgets.
- Validate the **proposal** the agent returns and insert it into `ai_actions`.
- Return a structured response to the admin UI.

The orchestrator does **not** apply the proposal. Application is a separate server action triggered when the admin clicks Approve.

## 2. Routing matrix

| Request kind | Default agent | Notes |
|---|---|---|
| `suggest_quote` (RFQ in admin) | `pricing-agent` | account context, products in the RFQ |
| `triage_inventory` (cron / admin) | `inventory-triage-agent` | scoped to suppliers and SKUs flagged in the latest sync |
| `evaluate_tier` (cron / admin) | `tier-classifier-agent` | scoped to one account; window per pricing engine spec |
| `draft_ticket_reply` (new ticket / admin) | `customer-support-agent` | ticket history + account snapshot |
| `explain_audit_entry` (admin clicked an audit row) | `audit-explainer-agent` (v2) | reads the audit row + neighbors; in v1 the orchestrator emits a stub |

A misrouted request returns `404 unknown_agent` rather than guessing.

## 3. Request shape

```http
POST /ai/route
Authorization: Bearer <admin/staff JWT>
Content-Type: application/json
```

```json
{
  "kind": "suggest_quote",
  "scope": {
    "account_id": "uuid",
    "items": [{ "variant_id": "uuid", "qty": 25 }]
  },
  "options": {
    "max_cost_usd": 0.25,
    "model_hint": "claude-opus-4-7"
  }
}
```

## 4. Response shape

```json
{
  "proposal_id": "uuid",
  "agent_code": "pricing-agent",
  "summary": "Suggested 4% off for 25-unit cart, putting price ~3% above your floor.",
  "diff": { "before": {...}, "after": {...} },
  "rationale": "Customer is 3 units away from Tier 3...",
  "tool_calls": [
    { "name": "read_prices", "args": {...}, "result_summary": "..." }
  ],
  "cost_usd": 0.04,
  "tokens": { "input": 1200, "output": 400, "cached": 800 }
}
```

The structured `diff` powers the admin UI's "Show me what changes" panel.

## 5. Prompt structure (Agent SDK)

```
[ system ]
  Cached: developer standard, agent role, action budget, redaction rules.

[ context — non-cached, request-specific ]
  account snapshot, request scope, neighbor data (orders, prices, etc.).

[ tools ]
  Bounded set per agent (see AGENTS-ROSTER.md).

[ user ]
  "Propose the smallest, safest action that resolves the scoped intent."
```

The system block is **prompt-cached** so the per-call cost stays under control.

## 6. Tool budget

- Per call: hard cap on the number of tool roundtrips (default 12, lower for simple agents).
- Per call: hard cap on token output.
- Per call: hard cap on cost in USD (`options.max_cost_usd` request-supplied, capped at a server-wide ceiling).
- Per agent: hard daily cap on invocations and on cost.

When a cap is reached, the orchestrator returns a friendly "budget exhausted" response and writes a `budget_exhausted` event to `audit_log`.

## 7. Idempotency & retries

- Every inbound request carries (or is assigned) an `Idempotency-Key`. If the same key has been processed within the last 24h, the orchestrator returns the cached response.
- Tool calls inside the agent loop are idempotent on the platform side (reads only by default).
- Model timeouts are retried once with the OpenRouter fallback gateway for the same model family; otherwise the orchestrator returns `503`.

## 8. Safety stops

The orchestrator refuses to dispatch if **any** of these is true:

- The calling user is not `staff` or `admin`.
- The scoped data crosses tenants or is otherwise impossible for the user to access via the admin dashboard.
- The redaction layer cannot confidently strip PII from a sub-field that the prompt would include.
- A circuit breaker is open (e.g. agent error rate > 5% in the last 5 minutes).

Each refusal is logged in `audit_log` with a structured reason.

## 9. Observability

- Every call writes a single `ai_runs` row with `request_id`, `agent_code`, `kind`, `cost_usd`, `tokens`, `tool_call_count`, `outcome`.
- Sentry tags errors with the agent code and the request kind.
- A daily digest summarizes proposals by agent and the approval rate.

## 10. References

- [`AGENT-SWARM-OVERVIEW.md`](AGENT-SWARM-OVERVIEW.md)
- [`AGENTS-ROSTER.md`](AGENTS-ROSTER.md)
- [`EVAL-AND-GUARDRAILS.md`](EVAL-AND-GUARDRAILS.md)
- Service entrypoint: [`services/ai-api/src/server.ts`](../../services/ai-api/src/server.ts)
