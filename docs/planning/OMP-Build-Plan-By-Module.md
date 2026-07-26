# OMP Platform — Build Plan by Module

> Detailed, module-by-module breakdown of everything to build, front to back — sized for the OMP quote.
> Companion to the mind map (`OMP-Platform-Scope-Mindmap.md`). This document is the **work breakdown**: each module is an independently estimable unit.

**Legend**
- **State:** `DONE` (built & working) · `SCAFFOLD` (structure exists, logic pending) · `TODO` (build from scratch) · `NEW` (new scope, designed in docs, not built) · `DECISION` (needs a client/business call)
- **Size:** relative complexity, **not hours** — `S` · `M` · `L` · `XL`
- **Reality check:** the entire **frontend is a working mockup on mock data** (deployed to Vercel, zero live backend calls). The backend is scaffold. Most remaining cost is (a) wiring the mockup to a real backend and (b) the four new-scope modules (Pricing v2, Catalog I/O, Partner API, SmartPay).

---

## Module index (budget roll-up)

| # | Module | State | Size | One-liner |
|---|---|---|---|---|
| **Foundation** ||||
| M00 | Project setup & DevOps | SCAFFOLD | M | Repo, Docker, CI, VPS, envs, Supabase link |
| M01 | Database schema & migrations | SCAFFOLD | L | Tables & enums, 0001–0009 |
| M02 | RLS & authorization policies | SCAFFOLD | L | Row-level security on every table |
| M03 | Auth & identity | TODO | L | Supabase Auth, roles, JWT claims, M2M keys |
| M04 | Design system & UI kit | DONE | M | Tokens, primitives, layouts |
| M05 | Shared types package | SCAFFOLD | S | Domain types across apps/services |
| **Storefront** ||||
| M06 | Catalog & product browsing | DONE / wire | L | Catalog, filters, product detail |
| M07 | Cart & checkout | DONE / wire | L | Cart, pricing, Stripe checkout |
| M08 | Customer portal | DONE / wire | L | Account, orders, addresses, settings |
| M09 | Portal: Inventory API self-serve | DONE / wire | M | Keys, feed view, docs (gated T3/T4) |
| **Admin** ||||
| M10 | Admin dashboard core | DONE / wire | L | Customers, orders, inventory, prices, reports |
| M11 | Admin: pricing flag queue | TODO NEW | L | Override / acknowledge / watch |
| M12 | Admin: catalog import/export | TODO NEW | L | Upload, mapping, dry-run, errors |
| M13 | Admin: partner management | TODO NEW | L | Keys, subscriptions, margin, locations, orders |
| **Pricing** ||||
| M14 | Pricing Engine v2 batch | TODO NEW | XL | Nightly waterfall, CTIA gate, floors, flags |
| M15 | Competitive benchmark connectors | TODO NEW | L | eBay, Best Buy, Amazon, Walmart, Back Market |
| M16 | Realtime pricing edge function | SCAFFOLD | M | Serve session-tier price |
| **Catalog & Suppliers** ||||
| M17 | Catalog standard & import pipeline | NEW | L | Normalize → validate → upsert; export |
| M18 | Supplier adapters (inbound) | SCAFFOLD | L | Source-1/2 REST + Scrapling + sync |
| **Partner Distribution** ||||
| M19 | Partner Inventory API (outbound) | TODO NEW | XL | Feed, keys, projection, webhooks, pull |
| M20 | SmartPay integration | TODO NEW | XL | Consumer feed + fulfillment write API |
| **Commerce backend** ||||
| M21 | Orders & sales domain | TODO | L | Cart→order→state machine, reservations |
| M22 | Payments (Stripe) | SCAFFOLD | M | Checkout, webhook, refunds, reconciliation |
| M23 | Fulfillment & shipping | TODO | L | Dropship dispatch, tracking, ETA, landed cost |
| **AI** ||||
| M24 | AI orchestrator & agent swarm | SCAFFOLD | XL | Orchestrator, 4 agents, tools, guardrails |
| **Cross-cutting** ||||
| M25 | Observability & ops | SCAFFOLD | M | Sentry, PostHog, logs, runbook |
| M26 | Security, compliance & data rights | PARTIAL | L | RLS tests, PII, LGPD/GDPR, secrets |
| M27 | QA, testing & release | TODO | XL | Unit, integration, contract, E2E, deploy |

---

# Foundation

## M00 · Project setup & DevOps `SCAFFOLD` `M`
**Purpose:** everything needed before feature work runs in a real environment.
**Depends on:** —

**Build items**
- [DONE] Monorepo layout (apps/web, services/*, packages/shared-types, supabase, docs)
- [DONE] Dockerfiles (web, ai-api, supplier-source-1/2) — multi-stage, non-root, healthcheck
- [DONE] docker-compose dev + prod (Caddy reverse proxy, registry tags)
- [TODO] CI pipeline (build + push images, run tests, lint) — **currently missing**
- [TODO] VPS provisioning: host, Caddy/TLS, Docker root, env.d per service
- [TODO] Supabase project link + migration apply flow (`supabase db push`)
- [DECISION] Deploy target: front on Vercel (current) vs docs' VPS — pick one, document
- [TODO] Secret provisioning per service (VPS env, no secrets in repo)
- [TODO] Staging environment

**Done when:** a push builds, tests, ships images, and deploys web + services to a reachable environment with migrations applied.

---

## M01 · Database schema & migrations `SCAFFOLD` `L`
**Purpose:** the Postgres schema all features read/write.
**Depends on:** M00

**Existing (written)**
- [DONE] 0001 initial schema — identity, accounts, tiers, catalog, suppliers, sales skeleton
- [DONE] 0003 pricing tiers — price_rules, prices, materialization fn
- [DONE] 0004 supplier sync — inventory_snapshots, sync runs, advisory-lock helpers
- [DONE] 0005 audit_log + ai_actions

**New (designed in docs, to write)**
- [TODO NEW] 0006 partner feed — api_keys, subscriptions, margin_rules, projection, deliveries, inventory_locations
- [TODO NEW] 0007 catalog standard — model_number/family/category, carrier/lock/grade/protocol, warehouse/qty_is_floor, vendor_grade_map, natural-key uniques
- [TODO NEW] 0008 pricing v2 — ctia_grade, prices flags (visible/flag/benchmark/confidence), competitor_quotes, pricing_flags, tier rename+rebound
- [TODO NEW] 0009 partner fulfillment — partner_fulfillment_orders + items, price_source, idempotency uniques

**Done when:** migrations apply cleanly on a fresh project; schema matches `DATA-MODEL.md`; types generated for the frontend.

---

## M02 · RLS & authorization policies `SCAFFOLD` `L`
**Purpose:** row-level security on every table; app-layer + DB-layer must agree.
**Depends on:** M01

**Build items**
- [DONE] 0002 RLS policies for the initial tables
- [TODO] Policies for all new tables (partner_*, fulfillment, pricing v2, catalog)
- [TODO] SECURITY DEFINER helpers (`current_user_role`, `is_account_member`)
- [TODO] Admin-only masking map + margin rules (never account-readable)
- [TODO] Partner isolation (an account never reads another's projection)
- [TODO] `fulfillment:write` vs `inventory:read` scope enforcement in app layer
- [TODO] RLS coverage tests (cross-tenant read attempts fail) → see M26/M27

**Done when:** every table has RLS; a customer cannot read another account; a partner key cannot exceed its scope; tests prove it.

---

## M03 · Auth & identity `TODO` `L`
**Purpose:** real authentication replacing the mockup's fake session.
**Depends on:** M01, M02

**Build items**
- [TODO] Supabase Auth (email+password, magic link, OAuth-ready)
- [TODO] Sign-up hook: mirror `auth.users` → `public.users`, default account + owner membership
- [TODO] JWT custom claims (`account_id`, `tier_id`) via before-token hook
- [TODO] Role model (customer/staff/admin) with DB re-derivation (JWT advisory only)
- [TODO] Admin invitation flow (staff/admin)
- [TODO] Password reset, session lifecycle (1h access / 30d refresh rotate)
- [TODO] Fresh re-auth (≤5 min) for sensitive admin actions
- [TODO NEW] M2M API-key auth: Argon2id hash, `key_id.secret`, per-key rate limit, overlap rotation, immediate revoke
- [TODO] Frontend: replace mock `store/auth.tsx` with real Supabase client + guards

**Done when:** real users sign in; roles enforced in DB; partner keys authenticate as M2M and never become a session.

---

## M04 · Design system & UI kit `DONE` `M`
**Purpose:** the visual language and reusable primitives.
**Depends on:** —

**Build items**
- [DONE] Tailwind tokens, tier color scale, spring easing, dark mode, mobile-first
- [DONE] Primitives: Button, Badge, Stars; portal/admin parts (Panel, Stat, Field)
- [DONE] Layouts: Root, Portal, Admin, Auth
- [TODO] Adopt Shadcn/UI for remaining complex components (dialogs, selects, tables) as features need them
- [TODO] Accessibility polish (focus rings, aria-live, contrast audit) → also M26

**Done when:** new features compose from the kit without bespoke CSS; passes an a11y pass.

---

## M05 · Shared types package `SCAFFOLD` `S`
**Purpose:** one source of truth for domain types across web + services.
**Depends on:** M01

**Build items**
- [DONE] pricing, order, supplier, catalog types (incl. CTIA grade, import row)
- [TODO] Keep in lock-step with generated Supabase types
- [TODO] Add partner, fulfillment, pricing-v2 result types
- [TODO] Publish/consume consistently (web, ai-api, partner-api)

**Done when:** a schema change surfaces as a type error in every consumer.

---

# Storefront

## M06 · Catalog & product browsing `DONE (mockup) / wire` `L`
**Purpose:** browse and view devices at the account's tier price.
**Depends on:** M01, M03, M16

**Frontend**
- [DONE] Catalog page + filters (brand, condition, storage, tier price)
- [DONE] Product detail (colors, storage, stock badge, reserve flow, recommendations)
- [DONE] Product cards/grid, tier badge/price, stock badge, sync heartbeat

**Backend / wiring**
- [TODO] Replace mock `data/catalog.ts` with real `products`/`product_variants` queries
- [TODO] Real stock from `inventory_snapshots` (+ Supabase Realtime for live updates)
- [TODO] Real tier price from `prices` (pricing v2 output)
- [TODO] Search + pagination server-side
- [TODO] Product images pipeline (per-model hosting)

**Done when:** the storefront renders real catalog, real stock, real tier prices; updates live.

---

## M07 · Cart & checkout `DONE (mockup) / wire` `L`
**Purpose:** build a cart, price it, pay.
**Depends on:** M06, M16, M21, M22

**Frontend**
- [DONE] Cart page + cart drawer, quantity controls
- [DONE] Checkout page shell

**Backend / wiring**
- [TODO] Real pricing-engine RPC for cart line + totals at effective tier
- [TODO] Create `draft` order + Stripe checkout session (server action)
- [TODO] Stock reservation on checkout start
- [TODO] Post-payment order transition (via M22 webhook)
- [TODO] Guest vs. signed-in cart handling

**Done when:** a real cart produces a real Stripe session and a paid order.

---

## M08 · Customer portal `DONE (mockup) / wire` `L`
**Purpose:** self-service account surface.
**Depends on:** M03, M21, M22

**Frontend (built)**
- [DONE] Overview, Orders list, Order detail (timeline, items, totals)
- [DONE] Order PDF/CSV export (jsPDF)
- [DONE] Wishlist, Tier dashboard
- [DONE] Addresses, Payment methods, Settings (daily stock digest opt-in)

**Backend / wiring**
- [TODO] Real orders/order_items via Supabase + RLS
- [TODO] Addresses CRUD (default shipping/billing)
- [TODO] Stripe-managed payment methods (add/remove/default)
- [TODO] Realtime order/shipment status (channel filtered by account_id)
- [TODO] Settings persistence + notification prefs

**Done when:** a logged-in customer sees only their real data; exports and realtime work.

---

## M09 · Portal: Inventory API self-serve `DONE (mockup) / wire` `M`
**Purpose:** let a T3/T4 account get and manage its API feed.
**Depends on:** M03, M19

**Frontend (built)**
- [DONE] Inventory API page — live feed simulation, credentials (blur secret), webhook payload, endpoints, code samples; gated to T3/T4 with lock glyph + upsell for T1/T2

**Backend / wiring**
- [TODO] Real key issue/rotate/revoke (calls M19 + M03)
- [TODO] Real webhook endpoint registration + health
- [TODO] Real feed data + delivery history
- [TODO] Real code samples reflect the account's key

**Done when:** an eligible customer self-issues a key and sees their real feed.

---

# Admin

## M10 · Admin dashboard core `DONE (mockup) / wire` `L`
**Purpose:** back-office for daily operations.
**Depends on:** M01, M02, M03

**Frontend (built)**
- [DONE] Dashboard KPIs, Customers (+inline tier assign), Orders, Inventory, Prices, API logs, AI bots, Reports

**Backend / wiring**
- [TODO] Wire every view to real data + RLS (staff vs admin)
- [TODO] Order transitions (staff-permitted), refunds (admin-gated)
- [TODO] Customer/account management + tier override (audited)
- [TODO] Reporting queries (sales, supplier health, tier distribution)

**Done when:** admins run real operations; actions hit `audit_log`.

---

## M11 · Admin: pricing flag queue `TODO` `NEW` `L`
**Purpose:** resolve SKUs the pricing batch flagged.
**Depends on:** M14

**Build items**
- [TODO] Flag queue list (sku, vendor, cost, benchmark, gap-to-floor, sources, timestamp)
- [TODO] Override action (manual price, 30-day expiry, audited)
- [TODO] Acknowledge action (stays T3/T4-only)
- [TODO] Watch action (auto-reprice nightly, auto-unflag when it clears)
- [TODO] Filters (flag type, tier, confidence)

**Done when:** an admin triages a flagged SKU through all three actions with audit trail.

---

## M12 · Admin: catalog import/export `TODO` `NEW` `L`
**Purpose:** maintain catalog by file, both directions.
**Depends on:** M17

**Build items**
- [TODO] Upload `.xls/.xlsx/.csv` (supplier feed or canonical)
- [TODO] Column-mapping profile selector (per supplier)
- [TODO] Dry-run preview: parsed rows, per-row validation, rejects with reasons
- [TODO] Commit import (idempotent upsert) with a run summary
- [TODO] Export canonical CSV (round-trippable, with cost) + optional xlsx
- [TODO] Import history / run log

**Done when:** an admin imports a real HYLA feed, sees rejects, commits, and re-exports losslessly.

---

## M13 · Admin: partner management `TODO` `NEW` `L`
**Purpose:** operate the outbound program.
**Depends on:** M19, M20

**Build items**
- [TODO] Partner list + grant/revoke feed access
- [TODO] API keys (issue, rotate with overlap, revoke)
- [TODO] Subscriptions (endpoint, filters, price_source, tier)
- [TODO] Margin rules editor (global default + per-partner, bps, floor)
- [TODO] Inventory locations / masking map editor (supplier↔location, public toggle)
- [TODO] Vendor grade → CTIA mapping editor
- [TODO] Partner fulfillment orders console (status, tracking, exceptions)
- [TODO] Webhook delivery monitor (degraded alerts)

**Done when:** an admin onboards a partner end-to-end without touching SQL.

---

# Pricing

## M14 · Pricing Engine v2 batch `TODO` `NEW` `XL`
**Purpose:** nightly, price every eligible SKU for all four tiers.
**Depends on:** M01, M15, M17, M18

**Build items**
- [DONE] Reference implementation `pricing_engine.py` (pure function)
- [TODO] Productionize as a batch service (`services/pricing-batch`)
- [TODO] Ingest daily feeds → CTIA grades (via M17/M18)
- [TODO] Waterfall: kit cost, tier bands, floors, per-tier flags
- [TODO] CTIA grade gate (sub-A hidden from T1/T2, skips paid comp fetch)
- [TODO] Publish to `prices` (visible/flag/benchmark/confidence)
- [TODO] Flag queue population (→ M11)
- [TODO] Guardrails: >15% cost-change hold, zero-qty delist, multi-vendor lowest-cost
- [TODO] Nightly scheduler (pg_cron or job runner), pipeline stages 02:00–03:45
- [TODO] Golden-file + unit + tier-order tests (→ M27)
- [DECISION] Confirm orphan grade `TPS A-` (defaults to CTIA C)
- [DECISION] Drops cart-tier promotion (Agreement §1.3) — Change Order

**Done when:** a nightly run prices the full catalog, flags correctly, and publishes; golden file passes.

---

## M15 · Competitive benchmark connectors `TODO` `NEW` `L`
**Purpose:** pull nightly comps from five marketplaces.
**Depends on:** M00

**Build items**
- [TODO] eBay Browse API connector (used/refurb + sold)
- [TODO] Best Buy developer API connector (new SRP)
- [TODO] Amazon Renewed via aggregator/Keepa connector
- [TODO] Walmart Restored via same aggregator
- [TODO] Back Market scheduled scrape (Scrapling)
- [TODO] Normalize to `CompetitorQuote` (source, price, condition, lock_matched)
- [TODO] Match logic (model + capacity + condition + lock) + admin condition map
- [TODO] Failover aggregator + cost caps (~$150–200/mo budget)
- [TODO] Cache + rate-limit per source

**Done when:** each source returns matched quotes; the batch consumes them; a source outage degrades gracefully.

---

## M16 · Realtime pricing edge function `SCAFFOLD` `M`
**Purpose:** serve the caller's tier price with a single lookup (never computes).
**Depends on:** M01, M14

**Build items**
- [SCAFFOLD] `pricing-engine` Deno function (reference)
- [SCAFFOLD] `tier-upgrade` Deno function (cumulative units)
- [TODO] Read session tier server-side; return that tier's `prices` row + per-tier flag respect
- [TODO] Deploy + wire to storefront (M06/M07)
- [TODO] Perf budget p50<80ms / p99<250ms; rate limit

**Done when:** the storefront reads real prices in-budget; hidden tiers never leak a price.

---

# Catalog & Suppliers

## M17 · Catalog standard & import pipeline `NEW` `L`
**Purpose:** turn any vendor feed into normalized catalog rows.
**Depends on:** M01, M05

**Build items**
- [DONE NEW] Catalog standard doc + canonical CSV template
- [TODO NEW] Parser for `.xls/.xlsx/.csv` (HYLA Daily Stock Report shape proven)
- [TODO NEW] Three-layer explode: product / variant / inventory offer
- [TODO NEW] Normalization: carrier synonyms, CTIA grade map, masked-qty `200+`, color `*`
- [TODO NEW] Deterministic SKU minting (grade-suffix preserved)
- [TODO NEW] Validation (mandatory-by-category, cost>0, currency)
- [TODO NEW] Idempotent upserts (product/variant/inventory natural keys)
- [TODO NEW] Vendor column-mapping profiles
- [TODO NEW] Canonical export (round-trippable)

**Done when:** a real feed imports idempotently; export re-imports losslessly (proven on 2,675 rows).

---

## M18 · Supplier adapters — inbound `SCAFFOLD` `L`
**Purpose:** pull each supplier's catalog + inventory on schedule.
**Depends on:** M17

**Build items**
- [SCAFFOLD] Source-1 (Assurant/HYLA) adapter structure (client, models, writer, sync, CLI)
- [SCAFFOLD] Source-2 (Mannapov + reserved DXB) adapter structure
- [TODO] Real REST ingestion per supplier
- [TODO] Scrapling HTML fallback (today raises `NotImplementedError`)
- [TODO] Scheduled sync (pg_cron), advisory locks, sync-run rows, idempotency
- [TODO] Discrepancy detection → inventory-triage-agent
- [TODO] Warehouse → inventory_location mapping on ingest

**Done when:** each supplier syncs end-to-end against sandbox feeds with non-zero rows; drift-resilient.

---

# Partner Distribution

## M19 · Partner Inventory API — outbound `TODO` `NEW` `XL`
**Purpose:** OMP as a supplier — machines read live, masked, marked-up stock.
**Depends on:** M01, M03, M14, M17

**Build items**
- [DONE NEW] Design contract (PARTNER-INVENTORY-API.md)
- [TODO NEW] `services/partner-api` service (Node + TS)
- [TODO NEW] API-key auth + `inventory:read` scope
- [TODO NEW] Subscriptions + `price_source` (cost_plus_margin | tier)
- [TODO NEW] Projection recompute (account × variant × location), in-tx, advisory lock
- [TODO NEW] No-op suppression via `content_hash`
- [TODO NEW] Webhook emitter: HMAC sign, monotonic sequence, retry+backoff+jitter, degraded status
- [TODO NEW] Pull endpoints: cursor pagination, brand/condition/location filters
- [TODO NEW] Margin resolution + floor invariant (reject ≤cost at write)
- [TODO NEW] Masking allow-list serializer + contract tests (no supplier/cost leak)
- [TODO NEW] Rate limits + SSRF deny-list on endpoint_url

**Done when:** a partner subscribes, receives signed deltas + reconciles by pull; masking tests pass; no full-catalog storms.

---

## M20 · SmartPay integration `TODO` `NEW` `XL`
**Purpose:** first partner — consumer-tier feed **plus** fulfillment write.
**Depends on:** M19, M21, M23

**Build items**
- [DONE NEW] Integration contract (SMARTPAY-INTEGRATION.md)
- [TODO NEW] Feed at CONSUMER tier, Apple+Samsung, certified-only (A/CPO/NEW)
- [TODO NEW] Brand-inclusive filter + `delivery_eta_days` + `carrier_options`
- [TODO NEW] Fulfillment write API: `POST /fulfillment/orders` (place), cancel, status
- [TODO NEW] Required `Idempotency-Key` (24h) + `unique (account, partner_order_ref)`
- [TODO NEW] `fulfillment:write` separate credential + mutual HMAC
- [TODO NEW] Reservation on accept (decrement projection)
- [TODO NEW] Order status webhooks to SP (accepted→…→delivered/exception)
- [TODO NEW] Price authoritative from OMP, never client-supplied
- [DECISION] OMP↔SP margin formula (fixed vs %)
- [DECISION] Blind-dropship / SP-branded packaging
- [TODO] Returns/RMA flow (own contract)
- [TODO] CUPE marketplace validation learnings feed-in

**Done when:** SP pulls consumer feed and places an idempotent order that reserves stock and dropships; double-submit is a no-op.

---

# Commerce backend

## M21 · Orders & sales domain `TODO` `L`
**Purpose:** the order lifecycle both humans and partners feed into.
**Depends on:** M01, M02

**Build items**
- [TODO] Cart → draft order → state machine (draft→pending→paid→fulfilling→shipped→delivered→canceled/refunded)
- [TODO] Order items with price snapshot + supplier routing
- [TODO] Stock reservation model (net-of-reservations, shared with partner feed)
- [TODO] Tier-at-order capture; cumulative-units tier lifecycle (tier-upgrade fn)
- [TODO] Refund/return states + audit
- [TODO] Partner fulfillment orders unify into the same domain

**Done when:** an order moves through all states with correct stock and audit, from any channel.

---

## M22 · Payments — Stripe `SCAFFOLD` `M`
**Purpose:** take money and reconcile.
**Depends on:** M21

**Build items**
- [SCAFFOLD] `stripe-webhook` function (signature verify, transition, payments row)
- [TODO] Checkout session creation (server action)
- [TODO] Idempotency + replay protection (`stripe_event_id`)
- [TODO] Refunds + reconciliation jobs
- [TODO] Payment methods management (portal)
- [TODO] Stripe Tax (later milestone)

**Done when:** a real payment transitions an order and survives replay/idempotency drills.

---

## M23 · Fulfillment & shipping `TODO` `L`
**Purpose:** get devices to the door.
**Depends on:** M21, M18

**Build items**
- [TODO] Dropship dispatch to the routed supplier on paid order
- [TODO] Shipments table + carrier tracking (FedEx/UPS)
- [TODO NEW] Delivery ETA from origin location (TX/FL/CA)
- [TODO] Landed cost via live FedEx/UPS rates — Phase 2 (schema field reserved)
- [TODO] Ground + insurance option
- [TODO] Tracking webhooks → order.shipped/delivered

**Done when:** a paid order dispatches, tracks, and reports delivery; ETA shown pre-purchase.

---

# AI

## M24 · AI orchestrator & agent swarm `SCAFFOLD` `XL`
**Purpose:** admin-supervised agents that propose native actions.
**Depends on:** M01, M03

**Build items**
- [SCAFFOLD] Orchestrator + Fastify server
- [SCAFFOLD] Agents: pricing, tier-classifier, inventory-triage, customer-support
- [TODO] Real Anthropic Agent SDK wiring (no live calls yet)
- [TODO] MCP tools (read-only Supabase) per agent, least-privilege
- [TODO] Propose → admin-approve → apply loop, every action to `audit_log`
- [SCAFFOLD/TODO] Guardrails: prompt-injection, cost caps, redaction, eval set
- [TODO] Admin AI console wiring (M10)

**Done when:** a scripted scenario (low-stock → triage → admin-approved action) runs with full audit.

---

# Cross-cutting

## M25 · Observability & ops `SCAFFOLD` `M`
**Purpose:** see failures and operate.
**Depends on:** M00

**Build items**
- [SCAFFOLD] Sentry across services; PostHog in web
- [TODO] Structured logging + PII redaction
- [TODO] Ops runbook (sync fails, disputes, agent rollback, key rotation)
- [TODO] Health dashboards (supplier health, webhook delivery, tier distribution)
- [TODO] Alerts (degraded subscriptions, batch failures)

**Done when:** an incident is visible, attributable, and has a runbook.

---

## M26 · Security, compliance & data rights `PARTIAL` `L`
**Purpose:** protect data and meet regulation.
**Depends on:** M02, M03

**Build items**
- [DONE] Threat model + data classification docs
- [TODO] RLS coverage + auth-bypass tests
- [TODO NEW] Partner masking non-disclosure invariants + contract tests
- [TODO NEW] Idempotency / anti double-dispatch guarantees
- [TODO] Secrets management (VPS env, Keychain dev, rotation runbook)
- [TODO] End-customer PII handling (fulfillment ship-to) — redaction, retention
- [TODO] LGPD/GDPR/CCPA data-rights flows (export, delete)
- [TODO] Pre-launch security pass

**Done when:** RLS/masking/idempotency proven by tests; data-rights flows exist; security pass signed off.

---

## M27 · QA, testing & release `TODO` `XL`
**Purpose:** prove it works before and during ship.
**Depends on:** all

**Build items**
- [TODO] Frontend component/interaction tests
- [TODO NEW] Pricing golden-file + unit + tier-order tests
- [TODO] RLS / auth-bypass integration tests (real ephemeral Postgres)
- [TODO NEW] Partner API contract tests (masking, no-op suppression, cross-tenant)
- [TODO NEW] Fulfillment idempotency / double-submit tests
- [TODO] Supplier feed schema-drift tests
- [TODO] E2E happy paths (checkout, portal, admin)
- [TODO] Stripe replay/idempotency drills
- [TODO] Release checklist + rollback

**Done when:** all suites green in CI; E2E covers the core journeys; a release can roll back.

---

## Dependency spine (build order sketch)

```
M00 → M01 → M02 → M03 ─┬─→ M06/M07/M08/M09  (storefront + portal wiring)
                       ├─→ M10 → M11/M12/M13 (admin)
                       └─→ M24 (AI)

M17 → M18 → M14 ← M15        (catalog → suppliers → pricing batch)
              └─→ M16        (realtime price read)

M19 → M20                     (partner API → SmartPay)
M21 → M22 → M23               (orders → payments → fulfillment)

M25 / M26 / M27 span everything.
```

**Suggested phasing for the quote**
1. **Foundation** — M00–M05 (unlocks everything)
2. **Commerce core** — M21, M22, M06, M07, M16 (a real store)
3. **Catalog + pricing** — M17, M18, M14, M15 (real inventory & prices)
4. **Admin ops** — M10, M11, M12, M13
5. **Partner program** — M19, M20, M23
6. **AI + hardening** — M24, M25, M26, M27

---

## Open decisions to resolve before/within the quote

| # | Decision | Blocks |
|---|---|---|
| D1 | Deploy target: Vercel vs VPS | M00, infra cost |
| D2 | OMP↔SmartPay margin formula (fixed vs %) | M20 commercial terms |
| D3 | Blind-dropship / SP-branded packaging | M20, masking story |
| D4 | Tier rename in the live app (Multi-Store/Wholesale → Wholesale/Distributor) | M04/M06 copy, alignment |
| D5 | Cart-tier promotion dropped (Agreement §1.3) — Change Order | M14, contract |
| D6 | Orphan grade `TPS A-` → A/B/C | M14 correctness |
| D7 | Returns/RMA scope for partners | M20, M23 |
