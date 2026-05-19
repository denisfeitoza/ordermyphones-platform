# services/ai-api — Agent Orchestrator + Swarm

Node 20+ service that hosts the orchestrator and the v1 agent swarm. Builds on the **Anthropic Agent SDK** (`@anthropic-ai/claude-agent-sdk`) per developer standard §15.3.

## Surface

- **HTTP:** small Fastify-style server. Auth via Supabase admin/staff JWT. Internal-only — the storefront never calls this service directly.
- **MCP tools:** scoped Supabase reads + `propose_action` writer. Writes only via the proposal flow ([`docs/ai/AGENT-SWARM-OVERVIEW.md`](../../docs/ai/AGENT-SWARM-OVERVIEW.md)).
- **Gateways:** Anthropic API as primary, OpenRouter as fallback.

## Agents (v1)

- `pricing-agent`
- `inventory-triage-agent`
- `tier-classifier-agent`
- `customer-support-agent`

Per-agent contracts: [`docs/ai/AGENTS-ROSTER.md`](../../docs/ai/AGENTS-ROSTER.md).

## Local

```bash
cp .env.example .env
npm install
npm run dev          # http://localhost:8787
npm run typecheck
```

## Routes

| Method | Path | What |
|---|---|---|
| GET | `/healthz` | Liveness probe |
| POST | `/ai/route` | Orchestrator entry — see [`docs/ai/ORCHESTRATOR.md`](../../docs/ai/ORCHESTRATOR.md) |

## Docker

```bash
docker build -t ordermyphones-ai-api:dev .
docker run --rm -p 8787:8787 --env-file .env ordermyphones-ai-api:dev
```
