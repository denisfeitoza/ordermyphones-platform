# OMP Platform — Full Build Scope & Estimate Map


## 0 · How to read this map


**Status tags: [DONE] built & working · [SCAFFOLD] structure exists, logic pending · [TODO] build from scratch · [NEW] new scope, designed not built**


**Size hint = relative complexity, NOT hours: (S) small · (M) medium · (L) large · (XL) extra-large**


**Current reality: frontend is a complete working MOCKUP on mock data (deployed to Vercel); backend is scaffold; all data wiring + new scope is to build**


**Use per-leaf status + size to attach your hours/price for the OMP quote**


## 1 · Product & Business Model


**Two commercial directions**

- Storefront — sell to humans (tier-priced catalog, cart, checkout) [DONE mockup]
- Partner Inventory API — sell to machines (outbound feed + fulfillment) [NEW]

**Customer tiers (Pricing v2)**

- T1 Consumer 1–9 · market-benchmark price
- T2 Retailer 10–49 · consumer − $20
- T3 Wholesale 50–399 · cost-plus band
- T4 Distributor 400+ · cost-plus band
- NOTE: docs adopt v2 names; live app still shows Multi-Store/Wholesale — rename pending

**Suppliers (inbound sources, masked from partners)**

- Source 1 — Assurant / HYLA (US dropship, reverse-logistics volume)
- Source 2 — Mannapov LLC (US wholesale) + reserved Dubai (DXB) feed slot
- Masking: each supplier warehouse → OMP location e.g. TX1 → 'Texas Inventory'

**Actors & roles**

- Anonymous · Consumer · Retailer · Wholesale · Distributor
- Feed partner (read) · Fulfillment partner (write, e.g. SmartPay)
- Staff · Admin · Service (service_role) · AI agents (propose-only)

**Revenue mechanics**

- Tier pricing margin (benchmark − cost)
- Partner cost-plus margin (margin_bps) for wholesale resellers
- SmartPay fulfillment (consumer price + to-be-defined OMP↔SP margin)

## 2 · Frontend — Storefront (apps/web) [DONE mockup on mock data]


**Pages**

- Home / landing (Hero, Testimonials, Recommendations) [DONE] (M)
- Catalog + filters (brand, condition, storage, tier price) [DONE] (M)
- Product detail (colors, storage, stock badge, reserve flow) [DONE] (M)
- Cart page + Cart drawer [DONE] (M)
- Checkout page (Stripe UI shell) [DONE mockup] (M)
- Contact · Help pages [DONE] (S)
- Ops page (live sync heartbeat demo) [DONE] (S)
- Enter shortcut (/enter/:where mock session) [DONE] (S)

**Store components (24)**

- Header, Footer, Logo, Hero [DONE]
- ProductCard, ProductGrid, CatalogFilters [DONE]
- CartDrawer, ReserveFlow, StockBadge [DONE]
- TierBadge, TierPrice, SyncHeartbeat, Recommendations, Testimonials, Stars [DONE]

**TO WIRE (backend integration)**

- Replace mock CATALOG with real products/variants queries [TODO] (L)
- Real pricing-engine RPC for cart totals [TODO] (M)
- Real stock from inventory_snapshots + realtime [TODO] (M)
- Real Stripe checkout session creation [TODO] (M)

## 3 · Frontend — Customer Portal [DONE mockup]


**Overview (latest order, tier progress, next action) [DONE] (M)**


**Orders list + Order detail (timeline, items, totals) [DONE] (M)**


**Order PDF/CSV export (jsPDF) [DONE] (M)**


**Wishlist [DONE] (S)**


**Tier dashboard [DONE] (S)**


**Inventory API page — live feed simulation, gated T3/T4 [DONE NEW] (M)**


**Addresses CRUD [DONE mockup] (S)**


**Payment methods (Stripe-managed) [DONE mockup] (S)**


**Settings (profile, daily stock digest opt-in) [DONE mockup] (S)**


**TO WIRE: real account data, orders, addresses via Supabase + RLS [TODO] (L)**


**TO BUILD: real partner API key issue/rotate UI for the customer [TODO] (M)**


## 4 · Frontend — Admin Dashboard [DONE mockup]


**Dashboard KPIs [DONE] (M)**


**Customers + inline tier assignment [DONE] (M)**


**Orders management [DONE] (M)**


**Inventory view [DONE] (M)**


**Prices view [DONE] (M)**


**API logs view [DONE] (S)**


**AI bots view [DONE] (S)**


**Reports view [DONE] (S)**


**TO BUILD — new admin surfaces**

- Pricing flag queue (override / acknowledge / watch) [TODO NEW] (L)
- Catalog import/export UI (upload xls/csv, mapping, dry-run, errors) [TODO NEW] (L)
- Partner management (keys, subscriptions, margin rules) [TODO NEW] (L)
- Inventory locations / masking map editor [TODO NEW] (M)
- Partner fulfillment orders console [TODO NEW] (M)
- Vendor grade → CTIA mapping editor [TODO NEW] (M)
- Wire all admin views to real data + RLS [TODO] (XL)

## 5 · Design System & Shared UI [DONE]


**Tailwind tokens, tier colors, spring easing, dark mode [DONE] (M)**


**Primitives: Button, Badge, Stars, Field, Panel, Stat [DONE] (S)**


**Layouts: Root, Portal, Admin, Auth [DONE] (M)**


**Shadcn/UI adoption for remaining complex components [TODO] (M)**


**packages/shared-types (domain types, single source of truth) [SCAFFOLD] (S)**


## 6 · Backend — Database & RLS (Supabase Postgres) [SCAFFOLD + TODO]


**Existing migrations**

- 0001 initial schema (identity, tiers, catalog, suppliers, sales) [DONE] (L)
- 0002 RLS policies (every table) [DONE] (L)
- 0003 pricing tiers (price_rules, prices, materialization) [DONE] (M)
- 0004 supplier sync (inventory_snapshots, sync runs, advisory locks) [DONE] (M)
- 0005 audit log + ai_actions [DONE] (S)

**New migrations (designed, not written)**

- 0006 partner feed (keys, subscriptions, margin, projection, deliveries, locations) [TODO NEW] (L)
- 0007 catalog standard (model_number, carrier, grade, warehouse, vendor_grade_map) [TODO NEW] (M)
- 0008 pricing v2 (ctia_grade, prices flags, competitor_quotes, pricing_flags, tier rebound) [TODO NEW] (M)
- 0009 partner fulfillment (orders + items, price_source, idempotency) [TODO NEW] (M)

**RLS coverage tests (cross-tenant, scope isolation) [TODO] (L)**


**Seed data for demos [SCAFFOLD] (S)**


## 7 · Backend — Edge Functions (Deno) [SCAFFOLD]


**pricing-engine (read session tier price) — reference impl [SCAFFOLD] (M)**


**tier-upgrade (cumulative units lifecycle) — reference impl [SCAFFOLD] (M)**


**stripe-webhook (signature verify, order transition) — reference impl [SCAFFOLD] (M)**


**Wire + deploy all three to linked project [TODO] (M)**


**Rate limiting per-IP / per-user [TODO] (S)**


## 8 · Auth & Identity [SCAFFOLD → TODO]


**Supabase Auth (email+password, magic link, OAuth-ready) [TODO] (M)**


**Sign-up hook (mirror users, default account, membership) [TODO] (M)**


**JWT custom claims (account_id, tier_id) [TODO] (S)**


**Role model (customer/staff/admin) + SECURITY DEFINER helpers [TODO] (M)**


**Admin invitations flow [TODO] (S)**


**M2M API-key auth (Argon2, per-key rate limits, rotation) [TODO NEW] (L)**


**Session lifecycle, refresh rotation, re-auth for sensitive actions [TODO] (M)**


**Frontend currently uses MOCK auth — replace with real [TODO] (M)**


## 9 · Pricing Engine v2 (nightly batch) [NEW]


**Reference implementation pricing_engine.py [DONE] (M)**


**Productionize batch (services/pricing-batch) [TODO NEW] (L)**


**Five competitive sources**

- eBay Browse API connector [TODO] (M)
- Best Buy developer API connector [TODO] (M)
- Amazon Renewed (aggregator/Keepa) connector [TODO] (M)
- Walmart Restored (aggregator) connector [TODO] (S)
- Back Market scheduled scrape (Scrapling) [TODO] (M)

**Benchmark: match, ±30% trim, mean, locked ×0.9, confidence [TODO] (M)**


**CTIA grade gating + per-vendor grade map [TODO NEW] (M)**


**Waterfall: kit cost, floors, tier bands, per-tier flags [DONE ref / TODO prod] (M)**


**Flag queue processing + admin actions [TODO NEW] (M)**


**Tier-order + golden-file + unit tests [TODO] (L)**


**Nightly scheduler (pg_cron / job runner) [TODO] (S)**


**Contract note: drops cart-tier promotion (Agreement §1.3) — Change Order [DECISION] (S)**


## 10 · Supplier Integrations — inbound (Python + Scrapling) [SCAFFOLD]


**Source-1 adapter structure (client, models, writer, sync, CLI) [SCAFFOLD] (M)**


**Source-2 adapter structure [SCAFFOLD] (M)**


**Real REST ingestion per supplier [TODO] (L)**


**Scrapling HTML fallback (NotImplementedError today) [TODO] (M)**


**Daily .xls/.csv feed parser (HYLA Daily Stock Report shape) [TODO NEW] (M)**


**Idempotent upserts + advisory locks + sync-run rows [TODO] (M)**


**Discrepancy detection → inventory-triage-agent [TODO] (S)**


## 11 · Catalog Standard & Import/Export [NEW — standard DONE]


**Product catalog standard doc [DONE NEW] (M)**


**Canonical CSV import/export template [DONE NEW] (S)**


**Import pipeline: normalize → validate → upsert (3 layers) [TODO NEW] (L)**


**Vendor column-mapping profiles (per supplier) [TODO NEW] (M)**


**Carrier normalization + CTIA grade mapping [TODO NEW] (S)**


**Masked-quantity ('200+') + natural-key SKU minting [TODO NEW] (S)**


**Internal canonical export (round-trippable, with cost) [TODO NEW] (M)**


**Admin import/export UI (see branch 4) [TODO NEW] (L)**


## 12 · Partner Inventory API — outbound feed [NEW]


**Design contract (PARTNER-INVENTORY-API.md) [DONE NEW] (M)**


**services/partner-api service scaffold [TODO NEW] (M)**


**API-key auth + scopes (inventory:read) [TODO NEW] (M)**


**Subscriptions + price_source (cost_plus_margin | tier) [TODO NEW] (M)**


**Projection recompute (per account × variant × location) [TODO NEW] (L)**


**No-op suppression via content_hash [TODO NEW] (M)**


**Webhook emitter (HMAC sign, sequence, retry+backoff, degraded) [TODO NEW] (L)**


**Pull endpoints (cursor pagination, filters) [TODO NEW] (M)**


**Margin resolution + floor invariant [TODO NEW] (M)**


**Masking allow-list serializer + contract tests [TODO NEW] (M)**


**Rate limits, SSRF deny-list on endpoint_url [TODO NEW] (S)**


**Customer-facing Inventory API page [DONE mockup] (M)**


## 13 · SmartPay Integration (inventory + fulfillment) [NEW]


**Integration contract (SMARTPAY-INTEGRATION.md) [DONE NEW] (M)**


**OMP→SP feed at CONSUMER tier, Apple+Samsung, certified-only [TODO NEW] (M)**


**Brand-inclusive filter + delivery ETA + carrier options [TODO NEW] (M)**


**SP→OMP fulfillment write API (place/cancel/status) [TODO NEW] (L)**


**Required Idempotency-Key (anti double-dropship) [TODO NEW] (M)**


**fulfillment:write separate credential + mutual HMAC [TODO NEW] (M)**


**Order status webhooks to SP [TODO NEW] (M)**


**Reservation on accept (decrement projection) [TODO NEW] (M)**


**Open: OMP↔SP margin formula [DECISION] (S)**


**Open: blind-dropship / SP-branded packaging [DECISION] (S)**


**Open: returns / RMA flow [TODO] (M)**


**CUPE marketplace API validation (learnings) [TODO] (S)**


## 14 · AI Agent Swarm (services/ai-api) [SCAFFOLD]


**Orchestrator + server (Fastify) [SCAFFOLD] (M)**


**pricing-agent, tier-classifier, inventory-triage, customer-support [SCAFFOLD] (L)**


**Real Anthropic Agent SDK wiring (no live calls yet) [TODO] (L)**


**MCP tools (read-only Supabase) [SCAFFOLD] (M)**


**Propose→admin-approve→apply loop + audit [TODO] (M)**


**Guardrails: prompt-injection, cost caps, redaction, eval set [SCAFFOLD/TODO] (M)**


## 15 · Payments — Stripe [SCAFFOLD]


**Checkout session creation [TODO] (M)**


**stripe-webhook (paid → order transition, payments row) [SCAFFOLD] (M)**


**Idempotency + replay protection (stripe_event_id) [TODO] (S)**


**Refunds + reconciliation [TODO] (M)**


**Stripe Tax (later milestone) [TODO] (M)**


## 16 · Fulfillment & Shipping [TODO]


**Dropship dispatch to supplier on paid order [TODO] (M)**


**Shipments table + carrier tracking (FedEx/UPS) [TODO] (M)**


**Delivery ETA from location [TODO NEW] (S)**


**Landed cost (FedEx/UPS live rates) — Phase 2 [TODO] (M)**


**Ground + insurance option [TODO] (S)**


## 17 · Observability & Ops [SCAFFOLD → TODO]


**Sentry SDK across services [SCAFFOLD] (S)**


**PostHog product analytics [SCAFFOLD] (S)**


**Structured logging + PII redaction [SCAFFOLD] (M)**


**Ops runbook (sync fails, disputes, agent rollback) [TODO] (M)**


**Supplier health + tier distribution reports [TODO] (M)**


## 18 · Security & Compliance [PARTIAL]


**Threat model (STRIDE) [DONE doc] (M)**


**Data classification (incl. PII, partner, fulfillment) [DONE doc] (M)**


**RLS on every table + tests [TODO] (L)**


**Secrets management (VPS env, Keychain, rotation) [TODO] (S)**


**Partner masking non-disclosure invariants + tests [TODO NEW] (M)**


**Idempotency / anti double-dispatch [TODO NEW] (S)**


**LGPD/GDPR/CCPA data-rights flows [TODO] (M)**


**Pre-launch security pass [TODO] (M)**


## 19 · DevOps / Infra / Deploy [SCAFFOLD]


**Dockerfiles (web, ai-api, supplier x2) [DONE] (M)**


**docker-compose dev + prod (Caddy, registry) [DONE] (S)**


**VPS provisioning + Caddy TLS [TODO] (M)**


**CI pipeline (build/push images) — MISSING [TODO] (M)**


**Supabase project link + migrations apply [TODO] (S)**


**Deploy divergence: front on Vercel vs docs' VPS — DECIDE [DECISION] (S)**


**Env/secret provisioning per service [TODO] (S)**


## 20 · QA & Testing [TODO]


**Frontend component/interaction tests [TODO] (M)**


**Pricing golden-file + unit + tier-order tests [TODO NEW] (L)**


**RLS / auth-bypass integration tests [TODO] (L)**


**Partner API contract tests (masking, no-op, cross-tenant) [TODO NEW] (M)**


**Fulfillment idempotency / double-submit tests [TODO NEW] (M)**


**Supplier feed schema-drift tests [TODO] (M)**


**E2E happy paths (checkout, portal, admin) [TODO] (L)**


## 21 · Cross-cutting [PARTIAL]


**Mobile-first verified 320–428px [DONE frontend] (M)**


**Accessibility (landmarks, focus, contrast, aria-live) [PARTIAL] (M)**


**Performance budgets (pricing p50<80ms, storefront) [TODO] (S)**


**i18n: USD + English only at launch (Schedule A.3) [DONE scope] (S)**


**Money as integer cents end-to-end [DONE convention] (S)**


## 22 · Delivery Phases (budget roll-up)


**Phase 1 — Discovery & Design (wireframes, spec, supplier audit) [DONE/PARTIAL]**


**Phase 2 — Backend & Integrations (DB, RLS, adapters, pricing, AI v1) [TODO core]**


**Phase 3 — Frontend & Portal (wire mockup to backend) [mockup DONE, wiring TODO]**


**Phase 4 — QA, Deploy, Handover [TODO]**


**Added scope (new SOW / change order)**

- Partner Inventory API [NEW]
- Catalog Standard + Import/Export [NEW]
- Pricing Engine v2 (benchmark + CTIA) [NEW]
- SmartPay integration (inventory + fulfillment) [NEW]

**Budget note: mockup UI is built; the bulk of remaining cost is backend wiring + the 4 new-scope workstreams**

