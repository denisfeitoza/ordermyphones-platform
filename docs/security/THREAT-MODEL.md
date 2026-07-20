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
| Supplier identity ↔ location mapping | **High** | Postgres (`inventory_locations`) — leaking it undoes the white-label model |
| Partner margin rules | High | Postgres (`partner_margin_rules`) — reveals our cost basis by inversion |
| Partner API keys / webhook signing secrets | Critical | Postgres (hashed / `Restricted`), partner-side env |

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
| **Feed partner (M2M)** | External system holding an API key scoped to one account. Reads its own marked-up inventory feed. Nothing else — no orders, no PII, no other tenant. |

## 3. Threats (STRIDE-style summary)

### Spoofing

| Threat | Likelihood | Impact | Control |
|---|---|---|---|
| Forged JWT | Low | Critical | Supabase signed JWT; RLS re-derives role from `public.users`; JWT claims are advisory only. |
| Spoofed Stripe webhook | Medium | High | Signature verification on every webhook; replay protection via `stripe_event_id`. |
| Spoofed supplier response (MITM) | Low | Medium | HTTPS only; adapter pins TLS expectations; sandbox vs prod base URLs differ. |
| Forged partner API key | Low | Medium | Argon2id verification; `revoked_at` checked per request with no cache; rate limit applied *before* the hash comparison. |
| Attacker forges an `inventory.updated` webhook to a partner | Medium | High | Outbound HMAC-SHA256 `X-OMP-Signature` with a 5-min timestamp window; partner contract mandates verification before parsing. |

### Tampering

| Threat | Likelihood | Impact | Control |
|---|---|---|---|
| RLS bypass via service-role key leak | Low | Critical | Keys in VPS env + Supabase secrets only; rotation runbook. |
| SQL injection | Very low | Critical | Parameterized queries everywhere; no string concatenation in queries. |
| Order/price tampering by privileged user | Low | High | All mutations write to `audit_log` with `before/after`; reconciliation jobs detect drift. |
| AI proposal tampering (admin race condition) | Low | Medium | `ai_actions.status` is a state machine with valid transitions; `approved_by_user_id` + `applied_at` are immutable once set. |
| Partner replays a captured payload to desync its own state | Low | Low | Monotonic `sequence` per subscription; partner discards lower sequences; signature timestamp window. |
| Margin rule edited to sell at or below cost | Low | High | Floor invariant `partner_price_cents >= unit_cost_cents + min_margin_cents` validated at rule-write time; violating rules rejected, never emitted. |

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
| **Supplier identity leaks into a partner payload** | Medium | **High** | Outbound serializer is an explicit field allow-list, not a redaction pass — a new upstream column cannot leak by default. Contract test asserts emitted keys == allow-list; second test asserts no `suppliers.display_name` string appears in any generated payload. |
| Our cost basis inferred from feed prices | Medium | Medium | Only the marked-up price is emitted; `unit_cost_cents` and `margin_bps` never cross the boundary. Residual inference risk if a partner also buys upstream directly — accepted, commercial not technical. |
| Cross-partner leak via the feed API | Low | Critical | Scope applied in the API service *and* RLS on `partner_inventory_projection`; integration tests attempt cross-account feed reads. |
| Internal errors leaked to partners | Medium | Low | Structured error envelope with a fixed code set + opaque `correlation_id`; stack traces, SQL and upstream error text never serialized outbound. |

### Denial of service

| Threat | Likelihood | Impact | Control |
|---|---|---|---|
| Supplier sync overload | Medium | Medium | Per-job concurrency caps; `pg_advisory_lock` prevents duplicates; backoff on 429s. |
| AI cost-explosion via crafted ticket | Medium | Medium | Per-call and per-day cost caps; circuit breaker on agent error rate. |
| Storefront bot traffic | Medium | Low | Caddy rate limits on the catalog endpoints; PostHog catches anomalies. |
| Webhook flood (inbound) | Low | Medium | Idempotency + Supabase function concurrency cap. |
| Outbound retry storm after a long partner outage | Medium | Medium | Per-subscription delivery concurrency cap + full jitter; queued events coalesced per SKU to the latest state before flushing. |
| Flapping supplier value causes emit churn | Medium | Low | `content_hash` no-op suppression; per-SKU emit-rate limit; flapping SKU routed to `inventory-triage-agent`. |
| Partner endpoint used as an SSRF pivot | Low | High | `endpoint_url` HTTPS-only and validated against a deny-list (private ranges, link-local, metadata IPs) at write time and again at resolve time. |

### Elevation of privilege

| Threat | Likelihood | Impact | Control |
|---|---|---|---|
| Customer escalates to admin | Very low | Critical | Role lives in `public.users`; only existing admin can elevate; sensitive admin actions require fresh re-auth within 5 min. |
| AI agent escalates beyond proposal | Very low | Critical | Agents have no write tools; the platform validates every approved proposal against business invariants. |
| Staff issues high-value refund without admin approval | Low | High | Refunds above a configured cap require `admin`; everything is in `audit_log`. |
| Partner key escalates to a customer session | Very low | Critical | An API key never mints a JWT, sets a cookie, or yields a Supabase client. Scope is inventory-read-only and strictly smaller than the account's own human session. |

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
