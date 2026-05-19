# Observability & Operational Runbook

> Logging, metrics, alerts, and the top incidents the operator will see. Builds on [`DEPLOYMENT.md`](DEPLOYMENT.md).

## 1. Stack

| Concern | Tool | Project structure |
|---|---|---|
| Error tracking | **Sentry** | One project per service: `web`, `ai-api`, `supplier-source-1`, `supplier-source-2`, `supabase-functions`. Releases tagged by container image tag. |
| Product analytics | **PostHog** | Single project, identified at sign-in. Funnels for sign-up, first purchase, tier promotion. |
| Uptime | **Better Stack** (or equivalent) | HTTPS checks every 60s for storefront, AI API health, supplier adapter health. |
| Database metrics | **Supabase dashboard** | Built-in (rows/sec, p95 query, connections). Slow queries above 250ms are alerted. |
| Container metrics | **cAdvisor + Prometheus + Grafana** (optional, decided in Phase 4) | Single Grafana panel for VPS CPU/RAM/disk + per-container memory. |

## 2. Logging conventions

- **Structured JSON** logs to stdout. Each line includes `service`, `env`, `request_id`, `account_id` (when applicable), `level`, `event`, `extra`.
- Sensitive fields (`email`, `phone`, `payment_intent_id`) are **redacted at the logger level**, not at the caller; redaction is centralized.
- `request_id` is generated at the reverse proxy (Caddy header `X-Request-Id`) and propagated to every downstream service.
- **No PII in error messages**; user-facing errors carry an opaque correlation ID that maps to the Sentry event.

## 3. Health endpoints

| Service | Path | What it checks |
|---|---|---|
| `apps/web` | `GET /healthz` | Static OK; useful only for cold-start verification. |
| `ai-api` | `GET /healthz` | OK if the orchestrator can list its agents and reach Supabase. |
| `supplier-source-1` | `GET /healthz` | OK if the last sync ran < `STALE_MINUTES` ago **or** if the latest run is currently in progress. |
| `supplier-source-2` | `GET /healthz` | Same as #1. |

Health endpoints are protected by an internal token from the VPS; the reverse proxy doesn't expose them to the public.

## 4. Alerts

| Trigger | Severity | Route |
|---|---|---|
| Sentry error rate ↑ 5× over baseline for 5 min | High | Slack `#ordermyphones-alerts` + email |
| Supplier sync `status='failed'` two consecutive runs | High | Slack + email |
| Stripe webhook delivery failures > 1% over 15 min | High | Slack |
| AI agent action rate ↑ 10× over baseline | Medium | Slack (likely a runaway loop) |
| Disk usage on VPS > 80% | Medium | Slack |
| TLS cert renewal in < 14 days (Caddy handles auto, but we monitor) | Low | Slack |
| Customer support ticket aged > 24h with no reply | Low | Slack |

Alert routing is configured in Sentry + Better Stack; Slack workspace is the Client's at the start of the maintenance addendum.

## 5. Top 8 incidents — runbook

### 5.1 Supplier sync failing for one feed

**Symptoms:** Sentry spike from `supplier-source-X`; `supplier_sync_runs.status = 'failed'`; admin sees a red badge on the Inventory dashboard.

**Diagnose**

1. Read the Sentry event; check the error type.
2. `docker compose logs --tail 500 supplier-source-X` on the VPS.
3. Query `select * from supplier_sync_runs where status='failed' order by ended_at desc limit 5;`

**Most common causes & fixes**

- **Auth 401:** rotated API key — update env var on VPS, `docker compose up -d supplier-source-X`.
- **Schema drift (Scrapling auto-relocation failed):** capture a real response sample; open a tracked finding in the adapter repo; ship a selector fix.
- **Rate limit (429):** the cron schedule is too aggressive — increase the interval or shard the requests.
- **Sandbox vs production mismatch:** confirm the env points to the right base URL.

**Rollback:** there's no rollback for sync — the prior snapshot is still authoritative. Stock display gracefully degrades to "Last updated X minutes ago" with a warning.

### 5.2 Stripe webhook backlog

**Symptoms:** Stripe dashboard shows many "Pending" deliveries; orders stuck in `pending_payment`.

**Diagnose**

1. Inspect the webhook endpoint in the Stripe dashboard — replay failed events.
2. Tail logs of the `stripe-webhook` edge function in Supabase.
3. Check signature verification errors.

**Fix**

- **Signature failure:** the webhook signing secret was rotated without updating the env. Set the new secret in Supabase secrets and redeploy the function.
- **Idempotency dedup:** harmless when retries are duplicates; idempotency keys keep the DB consistent.
- **Schema mismatch:** if a new Stripe event type was added that we don't handle yet, it's logged + ignored — open a backlog item.

### 5.3 AI agent action loop (suspicious volume)

**Symptoms:** `ai_actions` insert rate spikes; admin Slack channel flooded with proposals.

**Diagnose**

1. `select agent_code, count(*) from ai_actions where created_at > now() - interval '15 min' group by 1 order by 2 desc;`
2. Inspect a sample proposal payload for an obvious loop signature.

**Fix**

- Disable the offending agent via the `ai_agents.is_enabled` flag (`supabase`).
- Investigate the prompt / tool call that caused the loop.
- Restart `ai-api` to drop in-memory state.

### 5.4 Storefront 5xx burst

**Symptoms:** Sentry `web` error rate spikes.

**Diagnose**

1. Read the Sentry event class.
2. Common cause: a Supabase RLS denial behind a recent migration; the UI was relying on a column the policy now blocks for `anon`.

**Fix**

- Roll back the offending image (`RELEASE_TAG`) on the VPS while the cause is fixed.
- Patch the policy or the UI query; ship a new release.

### 5.5 RLS denial false positive

**Symptoms:** Admin or staff sees "Permission denied" on a previously working screen.

**Diagnose**

1. Reproduce in a staging session signed in as the same role.
2. Check `pg_log` for the policy that triggered the denial.

**Fix**

- Patch the policy or grant the missing role; **never** disable RLS to "fix" the symptom.
- Add a regression test to the RLS coverage suite.

### 5.6 Order stuck in `fulfilling`

**Symptoms:** Order remains `fulfilling` for > 24h with no shipment record.

**Diagnose**

1. Check the supplier dispatch logs for the order's `order_items[i].supplier_id`.
2. Check the supplier's web dashboard.

**Fix**

- If the supplier dropped the request: re-dispatch via the admin dashboard ("Re-send to supplier") which is idempotent.
- If a manual fulfillment is needed: admin enters tracking manually; status moves to `shipped`.

### 5.7 PostHog identification breaks after sign-out

**Symptoms:** Funnels show "anonymous" sessions where they shouldn't.

**Fix**

- Ensure `posthog.reset()` is called on sign-out and `posthog.identify(user_id)` on sign-in.
- Smoke test via the staging environment before release.

### 5.8 VPS disk pressure

**Symptoms:** Better Stack alert; Sentry latency creeping up.

**Diagnose**

1. `df -h` on the VPS.
2. `docker system df` for image/volume usage.

**Fix**

- `docker image prune -a --filter "until=168h"` to free old images.
- Rotate logs (`docker compose logs` are bounded by `daemon.json` `max-size` and `max-file`; verify settings are present).
- If postgres data dir on the VPS grew unexpectedly: it shouldn't — the DB is hosted on Supabase. If a local stack was left running, take it down.

## 6. Secret rotation

| Secret | Cadence | How |
|---|---|---|
| Supabase `service_role` key | On suspicion, otherwise yearly | Rotate in Supabase dashboard; update VPS env; restart affected services. |
| Anthropic API key | On suspicion, otherwise yearly | Rotate in Anthropic console; update env; restart `ai-api`. |
| OpenRouter API key | Same as above | Same. |
| Stripe API key | On suspicion (admin Slack); Stripe webhook secret rotated annually | Rotate in Stripe dashboard; update VPS env + Supabase secrets. |
| Supplier API keys | On Client request | Update VPS env; restart the affected adapter. |
| SSH keys | On personnel change | New key issued; old key revoked; key rotation logged. |

## 7. Reporting cadence (post-launch)

- **Weekly** ops email to the Client: uptime, top 3 incidents, sales summary, tier movement.
- **Monthly** review meeting (60 min): roadmap delta, technical debt, security incidents, AI agent performance.

## 8. Maintenance addendum hand-off

After Final Delivery, this runbook becomes the operational baseline under the §2.3 maintenance addendum. Updates to the runbook ship as PRs against this file with the date of the change in the commit message.
