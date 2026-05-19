# Threat Model

> Top-down view of the assets, the actors, and the controls that keep the Platform safe. Living document; updated whenever a control changes.

## 1. Assets

| Asset | Sensitivity | Where it lives |
|---|---|---|
| Customer PII (name, email, addresses, phone) | High | Postgres (`users`, `accounts`, shipping addresses) |
| Order history (incl. units / value) | Medium | Postgres (`orders`, `order_items`, `payments`) |
| Payment instruments | **PCI** (out of our scope) | Stripe vault; we only see `pm_*` / `pi_*` references |
| Supplier credentials / API keys | High | VPS env, Supabase secrets, macOS Keychain in dev |
| Service-role keys (Supabase) | Critical | Same as above |
| AI proposals + audit log | High | Postgres (`ai_actions`, `audit_log`) |
| Tier rules and pricing floors | Medium | Postgres (`price_rules`, admin-configured) |
| Brand assets, contracts | Medium | This repository (private) |

## 2. Actors

| Actor | Capabilities |
|---|---|
| Anonymous visitor | Read published catalog only. |
| Authenticated customer | Manage own account; place orders; view own portal. |
| Staff | Day-to-day operations; cannot rotate roles or run high-value reversals. |
| Admin | Full admin dashboard; approves AI proposals; rotates roles. |
| Service (Supabase `service_role`) | Bypasses RLS; used only by edge functions, supplier adapters, AI service. |
| Supplier | External; provides catalog and inventory; receives fulfillment requests. |
| Stripe | External; processes payments; sends webhooks. |
| AI agent | Application identity; reads via tools; proposes actions; never writes. |

## 3. Threats (STRIDE-style summary)

### Spoofing

| Threat | Likelihood | Impact | Control |
|---|---|---|---|
| Forged JWT | Low | Critical | Supabase signed JWT; RLS re-derives role from `public.users`; JWT claims are advisory only. |
| Spoofed Stripe webhook | Medium | High | Signature verification on every webhook; replay protection via `stripe_event_id`. |
| Spoofed supplier response (MITM) | Low | Medium | HTTPS only; adapter pins TLS expectations; sandbox vs prod base URLs differ. |

### Tampering

| Threat | Likelihood | Impact | Control |
|---|---|---|---|
| RLS bypass via service-role key leak | Low | Critical | Keys in VPS env + Supabase secrets only; rotation runbook. |
| SQL injection | Very low | Critical | Parameterized queries everywhere; no string concatenation in queries. |
| Order/price tampering by privileged user | Low | High | All mutations write to `audit_log` with `before/after`; reconciliation jobs detect drift. |
| AI proposal tampering (admin race condition) | Low | Medium | `ai_actions.status` is a state machine with valid transitions; `approved_by_user_id` + `applied_at` are immutable once set. |

### Repudiation

| Threat | Likelihood | Impact | Control |
|---|---|---|---|
| Admin denies approving an AI action | Low | Medium | `ai_actions.approved_by_user_id` + audit log with IP and UA; both are immutable. |
| Customer denies placing an order | Low | Medium | Stripe payment intent + signed receipt + audit log. |

### Information disclosure

| Threat | Likelihood | Impact | Control |
|---|---|---|---|
| Cross-tenant data leak via UI | Low | Critical | RLS enforces tenant isolation on every table; integration tests attempt cross-account reads. |
| PII in error messages / logs | Medium | Medium | Centralized redaction; user-facing errors use opaque correlation IDs. |
| Source code leak via the public web | Low | Medium | Repo is **private**; no production secret has ever been committed; `.gitignore` blocks `.env`. |
| AI prompt logs containing PII | Medium | Medium | Redaction layer before prompt construction; eval set verifies. |

### Denial of service

| Threat | Likelihood | Impact | Control |
|---|---|---|---|
| Supplier sync overload | Medium | Medium | Per-job concurrency caps; `pg_advisory_lock` prevents duplicates; backoff on 429s. |
| AI cost-explosion via crafted ticket | Medium | Medium | Per-call and per-day cost caps; circuit breaker on agent error rate. |
| Storefront bot traffic | Medium | Low | Caddy rate limits on the catalog endpoints; PostHog catches anomalies. |
| Webhook flood | Low | Medium | Idempotency + Supabase function concurrency cap. |

### Elevation of privilege

| Threat | Likelihood | Impact | Control |
|---|---|---|---|
| Customer escalates to admin | Very low | Critical | Role lives in `public.users`; only existing admin can elevate; sensitive admin actions require fresh re-auth within 5 min. |
| AI agent escalates beyond proposal | Very low | Critical | Agents have no write tools; the platform validates every approved proposal against business invariants. |
| Staff issues high-value refund without admin approval | Low | High | Refunds above a configured cap require `admin`; everything is in `audit_log`. |

## 4. AI-specific threats

Detailed in [`../ai/EVAL-AND-GUARDRAILS.md`](../ai/EVAL-AND-GUARDRAILS.md). The model is:

- Prompt injection (direct, indirect, token smuggling).
- Lazy AI loops (the agent stalls instead of acting).
- Negative or fractional values smuggled into tool args.
- Mass cost via runaway loops.

## 5. Controls inventory (single page)

- **AuthN:** Supabase Auth (email + password, magic link, OAuth-ready). 1h access tokens, 30d rotating refresh.
- **AuthZ:** RLS on every table + edge-function checks. `service_role` only on the server.
- **Validation:** Server-side on every mutation; client-side is UX only.
- **Webhooks:** Stripe signature verified; idempotency table.
- **Secrets:** VPS env + Supabase secrets + macOS Keychain (dev). Never in client bundle, never logged.
- **AI:** propose-then-apply, scoped tool surfaces, redaction layer, per-call and per-day caps, eval suite.
- **Network:** HTTPS only via Caddy; HSTS preload; modern TLS suites.
- **Logging:** structured JSON; PII redacted at the logger; Sentry + PostHog (PostHog respects user opt-out).
- **Backups:** Supabase PITR + nightly encrypted `pg_dump` to off-site; quarterly restore drill.
- **CI:** No skipped hooks; security checks (e.g. dependency audit) gate the merge.

## 6. Pre-launch checklist

A concrete, line-by-line checklist is in [`PRE-LAUNCH-CHECKLIST.md`](PRE-LAUNCH-CHECKLIST.md), executed at the end of Phase 4 ([`../phases/PHASE-4-QA-AND-DEPLOYMENT.md` §2.3](../phases/PHASE-4-QA-AND-DEPLOYMENT.md)).

## 7. Incident response (skeleton)

1. **Detect** — Sentry alert, customer report, or admin observation.
2. **Triage** — severity, blast radius, affected accounts.
3. **Contain** — rotate suspected credentials, disable affected agents/services if needed.
4. **Eradicate & remediate** — fix the cause, ship a release.
5. **Recover** — restore data from PITR if a write was destructive.
6. **Post-mortem** — blameless write-up; updates to this threat model and the eval suite.

The full IR runbook is added under the §2.3 maintenance addendum.

## 8. References

- [`../architecture/AUTH-AND-RLS.md`](../architecture/AUTH-AND-RLS.md)
- [`../architecture/OBSERVABILITY.md`](../architecture/OBSERVABILITY.md)
- [`DATA-CLASSIFICATION.md`](DATA-CLASSIFICATION.md)
- [`COMPLIANCE.md`](COMPLIANCE.md)
- [`../ai/EVAL-AND-GUARDRAILS.md`](../ai/EVAL-AND-GUARDRAILS.md)
