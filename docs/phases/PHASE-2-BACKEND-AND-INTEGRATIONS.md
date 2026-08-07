# Phase 2 — Backend, Database & Supplier Integrations

**Window:** Weeks 4–8 (≈ Day 22 – Day 56 of the Effective Date)
**Maps to Agreement:** §1.2, §1.3, §1.4, §1.6, §1.8 (modules 1, 2, 4, 5, 7, 8), §3.2 (Phase 2), Schedule A.

---

## 1. Goal

Stand up the **server foundation** of the Platform: database with RLS-everywhere, two supplier adapters covering three feeds, the pricing engine (tier-aware), authentication & authorization, payment infrastructure, and the v1 of the AI agent swarm.

By end of Phase 2 the system supports — via API and/or admin scripts — the following end-to-end flows (server-side only; UI lands in Phase 3):

1. Register/sign in a customer; assign Tier 1 by default.
2. Sync products and stock from both supplier feeds.
3. Compute tier-aware pricing on a hypothetical cart.
4. Create an order, charge via Stripe, and emit the dropship fulfillment payload.
5. Promote a customer from Tier N to Tier N+1 after the cumulative unit threshold is crossed.
6. Trigger an AI agent (e.g. inventory-triage) and have it execute a native action with audit trail.

---

## 2. Scope (in scope)

### 2.1 Database & RLS (Supabase / Postgres)

- All entities from [`docs/architecture/DATA-MODEL.md`](../architecture/DATA-MODEL.md): `accounts`, `users`, `customers`, `tiers`, `products`, `product_variants`, `inventory_snapshots`, `prices`, `price_rules`, `orders`, `order_items`, `shipments`, `payments`, `supplier_sync_runs`, `audit_log`, etc.
- **RLS enabled on every table.** Policies expressed per role (`anon`, `customer`, `admin`, `service_role`).
- Migrations versioned in [`supabase/migrations/`](../../supabase/migrations/) and applied via Supabase MCP / `supabase db push`.
- `pg_cron` schedules for inventory sync, tier recompute, stale-order sweeps.

### 2.2 Authentication & authorization

- Supabase Auth (email + password, magic link, OAuth ready).
- Roles: `customer`, `staff`, `admin`. Server-side enforcement via RLS + a tiny `authz` helper in edge functions.
- Customer-facing JWT carries `tier_id` and `account_id` claims for fast UI gating without extra round trips.

### 2.3 Supplier adapters (Python + Scrapling)

- `services/supplier-source-1/` — REST client + Scrapling adaptive fallback (selectors that survive HTML drift) for missing fields.
- `services/supplier-source-2/` — same architecture; consolidates the second US dropship feed and the Dubai wholesale feed into a single adapter, exposing both behind a unified `SupplierSource2.sync()` entrypoint.
- Both adapters write to Supabase via the `service_role` key, never to the client.
- Idempotency keys on every write; deletes never propagate without a manual flag.
- Telemetry: `supplier_sync_runs` table records start, end, rows touched, error code if any.

### 2.4 Pricing engine

- Edge function [`supabase/functions/pricing-engine/`](../../supabase/functions/pricing-engine/).
- Inputs: `customer_id`, `cart` (variants + quantities), `currency`.
- Outputs: per-line tier-aware price + cart-level total + the tier the customer is **on for this cart** (which can be higher than their stored tier if the cart itself crosses a threshold; see [PRICING-ENGINE.md](../architecture/PRICING-ENGINE.md) for the contract).
- Deterministic, fully unit-tested. No floating-point evaporation: per-unit prices stored as integer cents.

### 2.5 Tier upgrade & lifecycle

- Edge function [`supabase/functions/tier-upgrade/`](../../supabase/functions/tier-upgrade/) triggered after every paid order.
- Re-evaluates cumulative units in a rolling window (window definition signed off in Phase 1).
- Audit row written for every promotion/demotion.

### 2.6 Payments (Stripe)

- Stripe Connect account opened in the **Client's** legal name (Agreement §2.7).
- Server-side checkout session generation; client never touches secret keys.
- Webhook handler at [`supabase/functions/stripe-webhook/`](../../supabase/functions/stripe-webhook/) with signature verification, idempotency, and replay-safe state transitions.
- Reconciliation job nightly via `pg_cron`.

### 2.7 Sales & order modules

- Order state machine: `draft → pending_payment → paid → fulfilling → shipped → delivered | refunded | canceled`.
- Side-effect orchestration in transactions or saga (no fire-and-forget multi-write).
- Returns/refunds flow (skeleton; UI in Phase 3) with audit-only effect on tier promotion (returns reverse units within a defined window).

### 2.8 AI agent swarm (v1)

- AI service at [`services/ai-api/`](../../services/ai-api/) built on **Anthropic Agent SDK** (per global standard §15 of the developer's CLAUDE.md).
- **Orchestrator** + the v1 subset of agents from [`docs/ai/AGENTS-ROSTER.md`](../ai/AGENTS-ROSTER.md):
  - `pricing-agent` (suggests tier-aware quotes & special offers).
  - `inventory-triage-agent` (consolidates supplier discrepancies, flags low-stock SKUs).
  - `tier-classifier-agent` (explains tier promotion to a customer; suggests when to manually promote).
  - `customer-support-agent` (drafts replies; never sends without admin approval in v1).
- Every native action goes through the **action log** with rollback metadata (Agreement §1.8 — Customer Support & Sales Management).

### 2.9 Partner Inventory API (outbound feed)

The Platform as a supplier. Full design contract: [`../architecture/PARTNER-INVENTORY-API.md`](../architecture/PARTNER-INVENTORY-API.md).

- Migration `0006_partner_feed.sql`: `inventory_locations` (supplier → *"Texas Inventory"* masking map), `partner_api_keys`, `partner_feed_subscriptions`, `partner_margin_rules`, `partner_inventory_projection`, `partner_webhook_deliveries` — RLS on all six.
- `services/partner-api/` (Node + TS): API-key auth (Argon2id, per-key rate limits), `GET /v1/inventory` pull with cursor pagination, `GET /v1/inventory/{sku}`.
- Projection keyed `(account_id, variant_id, location_id)` — one masked OMP inventory per supplier, a SKU can sit in several, quantities never summed. Recomputed inside the same transaction as every stock movement (order `paid`/`canceled`, supplier sync delta), `pg_advisory_lock` per `(variant_id, location_id)`. Derived, never incremented in place.
- **No-op suppression via `content_hash`** — the adapters re-upsert the full catalog every cron tick; without this, every partner gets a full-catalog storm every N minutes.
- Outbound HMAC-SHA256 webhook delivery with monotonic `sequence`, exponential backoff + jitter (6 attempts), `degraded` status + admin alert on terminal failure.
- Margin resolution: platform default + per-partner override in basis points, `ceil` rounding, floor invariant `partner_price_cents >= unit_cost_cents + min_margin_cents` validated at rule-write time.
- Outbound serializer as an explicit **allow-list** so a new upstream column cannot leak by default.
- Admin UI for issuing/revoking keys and editing margin rules lands in Phase 3.

### 2.10 Analytics & reporting baseline

- Sentry SDK installed in every service; release tags wired to CI.
- PostHog SDK in `apps/web` (delivered in Phase 3); event taxonomy defined in Phase 2 docs.
- Admin dashboard reporting queries (raw SQL views) ready to be consumed by Phase 3 UI.

---

## 3. Out of scope (this phase)

- Customer-facing UI (Phase 3).
- Admin dashboard UI (Phase 3).
- 3D product viewer assets (UX work in Phase 1, ingestion logic in Phase 3).
- Multi-currency / multi-language (out of contract per Schedule A.3).

---

## 4. Entry criteria

- Phase 1 deliverables signed off.
- Supplier sandbox credentials in hand.
- Stripe account in the Client's name with API keys provided.
- Domain registered (production domain in the Client's name per Agreement §2.7).

---

## 5. Deliverables

| Deliverable | Location |
|---|---|
| Full migration set with RLS | [`supabase/migrations/`](../../supabase/migrations/) |
| Supplier #1 adapter (US dropship A) | [`services/supplier-source-1/`](../../services/supplier-source-1/) |
| Supplier #2 adapter (US dropship B + Dubai wholesale, consolidated) | [`services/supplier-source-2/`](../../services/supplier-source-2/) |
| Pricing engine edge function | [`supabase/functions/pricing-engine/`](../../supabase/functions/pricing-engine/) |
| Tier-upgrade edge function | [`supabase/functions/tier-upgrade/`](../../supabase/functions/tier-upgrade/) |
| Stripe webhook handler | [`supabase/functions/stripe-webhook/`](../../supabase/functions/stripe-webhook/) |
| AI service (orchestrator + v1 agents) | [`services/ai-api/`](../../services/ai-api/) |
| Partner Inventory API (pull endpoints + webhook emitter) | `services/partner-api/` |
| Partner feed migration + RLS | `supabase/migrations/0006_partner_feed.sql` |
| Partner integration guide (published to partners) | `docs/integrations/PARTNER-ONBOARDING.md` |
| Postman/Insomnia collection (or `.http` files) for QA | `docs/integrations/api-collections/` |
| Backend test suite (unit + integration on a real ephemeral Postgres) | `*/tests/` per service |
| Operational runbook v1 (sync failures, Stripe disputes, agent rollback) | `docs/architecture/OBSERVABILITY.md` |

---

## 6. Exit criteria

- Migrations apply cleanly on a fresh Supabase project.
- Supplier sync runs end-to-end against sandbox feeds with non-zero rows imported.
- Pricing engine passes 100% of its unit + integration tests, including: negative quantities rejected, zero/negative prices rejected, integer-cent math correctness, tier boundary edges (10, 50, 400 units).
- Stripe webhook survives a replay attack drill and an idempotency drill.
- AI agent swarm executes a scripted scenario (low-stock SKU → triage agent → admin-approval action) with full audit trail.
- All endpoints have RLS coverage tests (a `customer` cannot read another customer's orders; a `staff` cannot bypass an `admin`-only action).
- Partner feed: a contract test asserts the emitted JSON keys equal the allow-list **exactly**, and a second asserts no `suppliers.display_name` string appears in any generated payload.
- Partner feed: no-op suppression proven — two consecutive identical supplier syncs emit **zero** events; a one-unit change emits exactly one.
- Partner feed: cross-partner read attempt with a valid key returns `403`, and a partner key is proven unable to reach orders, PII, or any other account.
- Partner feed: margin floor holds — a rule that would price at or below `unit_cost_cents` is rejected at write time.
- Partner feed: a SKU stocked in two locations yields two independent rows and two independent event streams; draining one location does not alter the other's `available_qty`.
- No `--no-verify`, no skipped hooks, no `.env` committed; security checks pass.

---

## 7. Workstreams & sequencing

```
W1 (Supabase + RLS)   ─[migrations]─[RLS]─[edge fns]──────────────┐
W2 (Supplier #1)      ──[REST]──[Scrapling fb]──[sync job]────────┤
W3 (Supplier #2)      ──[REST]──[Dubai consol]──[sync job]────────┼─> Phase 2 review
W4 (Pricing + tiers)  ────[engine]──[upgrade]──[tests]────────────┤
W5 (Stripe)           ─────────[session]──[webhook]──[recon]──────┤
W6 (AI service v1)    ───────────[orchestrator]──[4 agents]───────┘
```

Workstreams W1, W2, W3 start in parallel on Day 1 of Phase 2. W4 begins as soon as the `prices` / `tiers` migrations land. W5 starts when Stripe creds arrive. W6 starts last (week 6) and consumes the now-stable data model.

---

## 8. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Supplier feed schema drift mid-phase | Medium | Medium | Scrapling adaptive selectors (auto-relocate on layout drift) + schema-shape integration tests run nightly. |
| Stripe Connect onboarding takes longer than 5 business days | Medium | Medium | Build the Stripe layer against `stripe-mock` first; integration test once the live account is live. |
| Tier promotion off-by-one due to refunds | High | High | Returns reverse units only within a documented window; explicit audit-log entries; integration test for each edge. |
| Race conditions on concurrent supplier syncs | Medium | High | Adapters acquire a `pg_advisory_lock` keyed by `(supplier_id, sync_kind)`; cron schedules are staggered. |
| Feed emits a full-catalog storm on every cron tick | High | High | `content_hash` no-op suppression is a Phase 2 exit criterion, not an optimization; per-SKU emit-rate limit as a second line. |
| Partner oversells on stale data after an outage | Medium | High | Availability published net of reservations; mandatory daily full-pull reconciliation written into the partner contract; `degraded` subscriptions raise an admin alert. |
| Supplier name or cost leaks into a partner payload | Medium | High | Allow-list serializer + two contract tests (key equality, supplier-name absence). Reviewed again in the Phase 4 security pass. |
| Supplier agreements do not permit white-label resale | Medium | **Critical** | **Legal, not technical.** Confirm resale / no-attribution / data-redistribution terms with Source A and Source B before exposing the feed to a real partner. Raised at the Phase 2 kickoff. |
| AI agent issues unsafe action (e.g. price = 0) | Low | Critical | Server-side validation on every tool call; agents propose, server validates against business invariants. See [`docs/ai/EVAL-AND-GUARDRAILS.md`](../ai/EVAL-AND-GUARDRAILS.md). |

---

## 9. Client interaction points

- **Start of Phase 2 — Kickoff (45 min).** Confirm supplier and Stripe credentials. **Confirm that the supplier agreements permit masked white-label resale** — this gates the Partner Inventory API.
- **Week 5 — Demo #1 (45 min).** Supabase explorer walkthrough of imported supplier data.
- **Week 7 — Demo #2 (60 min).** Live API call exercising the pricing engine and Stripe sandbox checkout.
- **End of Phase 2 — Review (90 min).** Sign-off on exit criteria; green light Phase 3.

---

## 10. Artifacts produced in the repository

- `supabase/migrations/*.sql`
- `supabase/functions/{pricing-engine,tier-upgrade,stripe-webhook}/`
- `services/supplier-source-1/`
- `services/supplier-source-2/`
- `services/ai-api/`
- `docs/integrations/api-collections/` (request collections)
- `docs/architecture/OBSERVABILITY.md` (runbook v1)
