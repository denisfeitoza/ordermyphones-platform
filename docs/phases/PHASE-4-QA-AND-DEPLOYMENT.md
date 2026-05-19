# Phase 4 — QA, Deployment & Final Delivery

**Window:** Weeks 14–17 (≈ Day 92 – Day 120 of the Effective Date)
**Maps to Agreement:** §1, §2.2 (Installment 4), §3.2 (Phase 4), §7 (Warranty), Schedule A.

---

## 1. Goal

Ship the Platform to production with confidence. By end of Phase 4 the Client receives a working, monitored, documented system at the production domain, with a 30-day warranty (Agreement §7.1) and a written maintenance addendum negotiated for ongoing operations (Agreement §2.3).

---

## 2. Scope (in scope)

### 2.1 Quality assurance

- **End-to-end test suite (Playwright)** covering the golden paths:
  - Consumer journey: register → browse → buy → track → reorder.
  - Retailer journey: tier-2 price visibility → bulk cart → checkout → tier-3 promotion.
  - Admin journey: customer override → manual order edit → refund → inventory sync inspection.
- **Backend integration tests** on a real ephemeral Supabase project (per the developer testing standard §3.7): supplier sync, pricing engine, tier upgrade, Stripe webhook, AI agent actions with audit verification.
- **Security pass** (see §2.3 below).
- **Load test** of the read-heavy paths (catalog list, product detail) with a representative dataset.
- **Visual regression baseline** captured for the top 12 customer-facing screens (mobile + desktop).

### 2.2 Production deployment

- Production VPS provisioned with Docker + Caddy (or Traefik) reverse proxy with automatic TLS (per developer standard §9).
- Containers built and pushed to the chosen registry (GHCR / private registry); deployed via `docker compose pull && up -d` over SSH.
- Production Supabase project linked; all migrations applied; RLS policies verified.
- Production Stripe account (Client-owned, per Agreement §2.7) wired; webhook endpoint configured.
- Production domain DNS pointed to the VPS (domain owned by the Client per Agreement §2.7).
- Sentry projects (`apps/web`, `ai-api`, `supplier-source-1`, `supplier-source-2`, `supabase/functions`) created and release-tagged.
- PostHog project (Client-owned) connected; dashboards exported.

### 2.3 Security pass

A documented sweep before Final Delivery. Each item produces a checked-off line in [`docs/security/PRE-LAUNCH-CHECKLIST.md`](../security/PRE-LAUNCH-CHECKLIST.md):

- **RLS coverage:** automated test attempts cross-account reads on every table; all must be denied.
- **Auth:** password policy, session expiry, magic-link single-use, JWT claim integrity.
- **Input validation:** server-side validation on every mutation; client-side considered UX only.
- **Secrets:** no `.env` in the repository; production secrets only in the VPS environment + Supabase config; no keys logged.
- **Webhooks:** Stripe signature verification, replay protection, idempotency keys honored.
- **AI tools:** every tool call validates inputs server-side against business invariants; agents cannot bypass RLS; per [`docs/ai/EVAL-AND-GUARDRAILS.md`](../ai/EVAL-AND-GUARDRAILS.md).
- **Prompt injection drill** against the customer-support and pricing agents; documented mitigations.
- **OWASP Top-10 spot-check** for the storefront and admin (SQLi via parameterized queries only, XSS via React + sanitized rich text, CSRF via SameSite cookies + state tokens, etc.).
- **Backups:** Supabase project on PITR; backup restoration drill on a temp project.

### 2.4 Observability & runbooks

- Sentry alert routing (error budget for each service).
- Uptime monitoring (Better Stack / UptimeRobot — Client's choice) for storefront, AI API, supplier adapters.
- On-call runbook for the top 8 production incidents (supplier sync failure, Stripe webhook backlog, AI agent error spike, etc.) in [`docs/architecture/OBSERVABILITY.md`](../architecture/OBSERVABILITY.md).

### 2.5 Documentation & handover

- Operator handbook in [`docs/ux/ADMIN-DASHBOARD.md`](../ux/ADMIN-DASHBOARD.md) (final).
- API reference for any integration partner.
- Architecture diagram (high level) printable for the Client's records.
- Maintenance addendum draft prepared per Agreement §2.3, ready for negotiation and written sign-off.

### 2.6 Final delivery

- Source repository ownership confirmed (per Agreement §5.1, transferred upon full payment).
- Production credentials rotated to Client-owned accounts where required.
- Walkthrough session (recorded, 90 min) covering admin workflows.
- 30-day Warranty Period starts (Agreement §7.1).

---

## 3. Out of scope (this phase)

- New features outside Phases 1–3 scope (handled as Change Orders).
- Ongoing maintenance, monitoring, supplier upkeep — handled under the §2.3 maintenance addendum once executed.
- Migration of legacy data (out of scope of the Agreement entirely).

---

## 4. Entry criteria

- Phase 3 accepted; staging environment representative of production.
- Stripe production account ready (Client's name) with banking verified.
- Production domain DNS access available to the Developer.
- VPS access (SSH key + hostname) configured.

---

## 5. Deliverables

| Deliverable | Location |
|---|---|
| Playwright e2e suite | `apps/web/tests/e2e/` |
| Backend integration tests | per-service `tests/` directories |
| Pre-launch security checklist (signed by Developer) | [`docs/security/PRE-LAUNCH-CHECKLIST.md`](../security/PRE-LAUNCH-CHECKLIST.md) |
| Production `docker-compose.prod.yml` + Caddyfile | [`docker-compose.prod.yml`](../../docker-compose.prod.yml), `infra/Caddyfile` |
| Production runbook | [`docs/architecture/OBSERVABILITY.md`](../architecture/OBSERVABILITY.md) |
| Backup restoration drill report | `docs/architecture/BACKUP-DRILL.md` |
| Operator handbook | [`docs/ux/ADMIN-DASHBOARD.md`](../ux/ADMIN-DASHBOARD.md) (final) |
| Maintenance addendum draft | `docs/contract/MAINTENANCE-ADDENDUM-DRAFT.md` |

---

## 6. Exit criteria — i.e. "Final Delivery"

- Playwright suite green on staging and production (smoke subset).
- Pre-launch security checklist 100% checked.
- Production deployment live at the Client's domain with valid TLS.
- Sentry releases tagged; PostHog dashboards loaded.
- Walkthrough recorded and shared with the Client.
- Installment 4 invoice issued (Agreement §2.2.4).
- Source ownership transferred upon receipt of Installment 4 (Agreement §5.1).

---

## 7. Workstreams & sequencing

```
W1 (E2E + integration tests)  ──[suite]──[fixtures]──[CI]────────┐
W2 (Security pass)            ────[RLS]──[secrets]──[OWASP]──────┤
W3 (Prod infra)               ──[VPS]──[compose]──[Caddy]──[DNS]─┼─> Final Delivery
W4 (Observability)            ──────[Sentry]──[PostHog]──[runbk]─┤
W5 (Docs & handover)          ──────────[handbook]──[walkthru]───┘
```

W3 starts as early as week 14; DNS cutover targeted for week 16 to allow a buffer week for the walkthrough and any post-cutover hot fixes within the warranty.

---

## 8. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Production DNS / TLS hiccups on cutover | Medium | High | Stage the cutover with a low-TTL DNS change 48h ahead; rollback plan documented in [`docs/architecture/DEPLOYMENT.md`](../architecture/DEPLOYMENT.md). |
| Stripe production account verification delays | Medium | High | Begin verification on week 14; in parallel, keep the sandbox active for the QA pass. |
| Supplier API quotas in production differ from sandbox | Medium | Medium | Confirm production quotas in writing; cron schedules adjusted to fit. |
| Last-week Change Order requests | Medium | Medium | Strict adherence to Agreement §8 — any scope change after Phase 3 acceptance is a CO with its own timeline. |
| Hidden mobile regressions | Medium | Medium | Visual regression baseline captured at start of Phase 4; regressions flagged in CI. |

---

## 9. Client interaction points

- **Week 14 — Kickoff (45 min).** Cutover plan, production credentials checklist.
- **Week 15 — Security pass review (60 min).** Walk through the pre-launch checklist.
- **Week 16 — Production cutover (live).** DNS swap window with both teams on-call.
- **Week 17 — Walkthrough & sign-off (90 min, recorded).** Final acceptance.
- **Day 30 after Final Delivery** — Warranty status check-in (per Agreement §7.1).

---

## 10. Artifacts produced in the repository

- `apps/web/tests/e2e/`
- `services/*/tests/`
- `supabase/tests/`
- `docs/security/PRE-LAUNCH-CHECKLIST.md`
- `docs/architecture/DEPLOYMENT.md` (final)
- `docs/architecture/OBSERVABILITY.md` (final)
- `docs/architecture/BACKUP-DRILL.md`
- `docs/contract/MAINTENANCE-ADDENDUM-DRAFT.md`
- `docker-compose.prod.yml`
- `infra/Caddyfile`
