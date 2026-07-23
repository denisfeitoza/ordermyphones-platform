<map version="1.0.1">
  <node TEXT="OMP Platform — Full Build Scope &amp; Estimate Map">
    <node TEXT="0 · How to read this map">
      <node TEXT="Status tags: [DONE] built &amp; working · [SCAFFOLD] structure exists, logic pending · [TODO] build from scratch · [NEW] new scope, designed not built"/>
      <node TEXT="Size hint = relative complexity, NOT hours: (S) small · (M) medium · (L) large · (XL) extra-large"/>
      <node TEXT="Current reality: frontend is a complete working MOCKUP on mock data (deployed to Vercel); backend is scaffold; all data wiring + new scope is to build"/>
      <node TEXT="Use per-leaf status + size to attach your hours/price for the OMP quote"/>
    </node>
    <node TEXT="1 · Product &amp; Business Model">
      <node TEXT="Two commercial directions">
        <node TEXT="Storefront — sell to humans (tier-priced catalog, cart, checkout) [DONE mockup]"/>
        <node TEXT="Partner Inventory API — sell to machines (outbound feed + fulfillment) [NEW]"/>
      </node>
      <node TEXT="Customer tiers (Pricing v2)">
        <node TEXT="T1 Consumer 1–9 · market-benchmark price"/>
        <node TEXT="T2 Retailer 10–49 · consumer − $20"/>
        <node TEXT="T3 Wholesale 50–399 · cost-plus band"/>
        <node TEXT="T4 Distributor 400+ · cost-plus band"/>
        <node TEXT="NOTE: docs adopt v2 names; live app still shows Multi-Store/Wholesale — rename pending"/>
      </node>
      <node TEXT="Suppliers (inbound sources, masked from partners)">
        <node TEXT="Source 1 — Assurant / HYLA (US dropship, reverse-logistics volume)"/>
        <node TEXT="Source 2 — Mannapov LLC (US wholesale) + reserved Dubai (DXB) feed slot"/>
        <node TEXT="Masking: each supplier warehouse → OMP location e.g. TX1 → 'Texas Inventory'"/>
      </node>
      <node TEXT="Actors &amp; roles">
        <node TEXT="Anonymous · Consumer · Retailer · Wholesale · Distributor"/>
        <node TEXT="Feed partner (read) · Fulfillment partner (write, e.g. SmartPay)"/>
        <node TEXT="Staff · Admin · Service (service_role) · AI agents (propose-only)"/>
      </node>
      <node TEXT="Revenue mechanics">
        <node TEXT="Tier pricing margin (benchmark − cost)"/>
        <node TEXT="Partner cost-plus margin (margin_bps) for wholesale resellers"/>
        <node TEXT="SmartPay fulfillment (consumer price + to-be-defined OMP↔SP margin)"/>
      </node>
    </node>
    <node TEXT="2 · Frontend — Storefront (apps/web) [DONE mockup on mock data]">
      <node TEXT="Pages">
        <node TEXT="Home / landing (Hero, Testimonials, Recommendations) [DONE] (M)"/>
        <node TEXT="Catalog + filters (brand, condition, storage, tier price) [DONE] (M)"/>
        <node TEXT="Product detail (colors, storage, stock badge, reserve flow) [DONE] (M)"/>
        <node TEXT="Cart page + Cart drawer [DONE] (M)"/>
        <node TEXT="Checkout page (Stripe UI shell) [DONE mockup] (M)"/>
        <node TEXT="Contact · Help pages [DONE] (S)"/>
        <node TEXT="Ops page (live sync heartbeat demo) [DONE] (S)"/>
        <node TEXT="Enter shortcut (/enter/:where mock session) [DONE] (S)"/>
      </node>
      <node TEXT="Store components (24)">
        <node TEXT="Header, Footer, Logo, Hero [DONE]"/>
        <node TEXT="ProductCard, ProductGrid, CatalogFilters [DONE]"/>
        <node TEXT="CartDrawer, ReserveFlow, StockBadge [DONE]"/>
        <node TEXT="TierBadge, TierPrice, SyncHeartbeat, Recommendations, Testimonials, Stars [DONE]"/>
      </node>
      <node TEXT="TO WIRE (backend integration)">
        <node TEXT="Replace mock CATALOG with real products/variants queries [TODO] (L)"/>
        <node TEXT="Real pricing-engine RPC for cart totals [TODO] (M)"/>
        <node TEXT="Real stock from inventory_snapshots + realtime [TODO] (M)"/>
        <node TEXT="Real Stripe checkout session creation [TODO] (M)"/>
      </node>
    </node>
    <node TEXT="3 · Frontend — Customer Portal [DONE mockup]">
      <node TEXT="Overview (latest order, tier progress, next action) [DONE] (M)"/>
      <node TEXT="Orders list + Order detail (timeline, items, totals) [DONE] (M)"/>
      <node TEXT="Order PDF/CSV export (jsPDF) [DONE] (M)"/>
      <node TEXT="Wishlist [DONE] (S)"/>
      <node TEXT="Tier dashboard [DONE] (S)"/>
      <node TEXT="Inventory API page — live feed simulation, gated T3/T4 [DONE NEW] (M)"/>
      <node TEXT="Addresses CRUD [DONE mockup] (S)"/>
      <node TEXT="Payment methods (Stripe-managed) [DONE mockup] (S)"/>
      <node TEXT="Settings (profile, daily stock digest opt-in) [DONE mockup] (S)"/>
      <node TEXT="TO WIRE: real account data, orders, addresses via Supabase + RLS [TODO] (L)"/>
      <node TEXT="TO BUILD: real partner API key issue/rotate UI for the customer [TODO] (M)"/>
    </node>
    <node TEXT="4 · Frontend — Admin Dashboard [DONE mockup]">
      <node TEXT="Dashboard KPIs [DONE] (M)"/>
      <node TEXT="Customers + inline tier assignment [DONE] (M)"/>
      <node TEXT="Orders management [DONE] (M)"/>
      <node TEXT="Inventory view [DONE] (M)"/>
      <node TEXT="Prices view [DONE] (M)"/>
      <node TEXT="API logs view [DONE] (S)"/>
      <node TEXT="AI bots view [DONE] (S)"/>
      <node TEXT="Reports view [DONE] (S)"/>
      <node TEXT="TO BUILD — new admin surfaces">
        <node TEXT="Pricing flag queue (override / acknowledge / watch) [TODO NEW] (L)"/>
        <node TEXT="Catalog import/export UI (upload xls/csv, mapping, dry-run, errors) [TODO NEW] (L)"/>
        <node TEXT="Partner management (keys, subscriptions, margin rules) [TODO NEW] (L)"/>
        <node TEXT="Inventory locations / masking map editor [TODO NEW] (M)"/>
        <node TEXT="Partner fulfillment orders console [TODO NEW] (M)"/>
        <node TEXT="Vendor grade → CTIA mapping editor [TODO NEW] (M)"/>
        <node TEXT="Wire all admin views to real data + RLS [TODO] (XL)"/>
      </node>
    </node>
    <node TEXT="5 · Design System &amp; Shared UI [DONE]">
      <node TEXT="Tailwind tokens, tier colors, spring easing, dark mode [DONE] (M)"/>
      <node TEXT="Primitives: Button, Badge, Stars, Field, Panel, Stat [DONE] (S)"/>
      <node TEXT="Layouts: Root, Portal, Admin, Auth [DONE] (M)"/>
      <node TEXT="Shadcn/UI adoption for remaining complex components [TODO] (M)"/>
      <node TEXT="packages/shared-types (domain types, single source of truth) [SCAFFOLD] (S)"/>
    </node>
    <node TEXT="6 · Backend — Database &amp; RLS (Supabase Postgres) [SCAFFOLD + TODO]">
      <node TEXT="Existing migrations">
        <node TEXT="0001 initial schema (identity, tiers, catalog, suppliers, sales) [DONE] (L)"/>
        <node TEXT="0002 RLS policies (every table) [DONE] (L)"/>
        <node TEXT="0003 pricing tiers (price_rules, prices, materialization) [DONE] (M)"/>
        <node TEXT="0004 supplier sync (inventory_snapshots, sync runs, advisory locks) [DONE] (M)"/>
        <node TEXT="0005 audit log + ai_actions [DONE] (S)"/>
      </node>
      <node TEXT="New migrations (designed, not written)">
        <node TEXT="0006 partner feed (keys, subscriptions, margin, projection, deliveries, locations) [TODO NEW] (L)"/>
        <node TEXT="0007 catalog standard (model_number, carrier, grade, warehouse, vendor_grade_map) [TODO NEW] (M)"/>
        <node TEXT="0008 pricing v2 (ctia_grade, prices flags, competitor_quotes, pricing_flags, tier rebound) [TODO NEW] (M)"/>
        <node TEXT="0009 partner fulfillment (orders + items, price_source, idempotency) [TODO NEW] (M)"/>
      </node>
      <node TEXT="RLS coverage tests (cross-tenant, scope isolation) [TODO] (L)"/>
      <node TEXT="Seed data for demos [SCAFFOLD] (S)"/>
    </node>
    <node TEXT="7 · Backend — Edge Functions (Deno) [SCAFFOLD]">
      <node TEXT="pricing-engine (read session tier price) — reference impl [SCAFFOLD] (M)"/>
      <node TEXT="tier-upgrade (cumulative units lifecycle) — reference impl [SCAFFOLD] (M)"/>
      <node TEXT="stripe-webhook (signature verify, order transition) — reference impl [SCAFFOLD] (M)"/>
      <node TEXT="Wire + deploy all three to linked project [TODO] (M)"/>
      <node TEXT="Rate limiting per-IP / per-user [TODO] (S)"/>
    </node>
    <node TEXT="8 · Auth &amp; Identity [SCAFFOLD → TODO]">
      <node TEXT="Supabase Auth (email+password, magic link, OAuth-ready) [TODO] (M)"/>
      <node TEXT="Sign-up hook (mirror users, default account, membership) [TODO] (M)"/>
      <node TEXT="JWT custom claims (account_id, tier_id) [TODO] (S)"/>
      <node TEXT="Role model (customer/staff/admin) + SECURITY DEFINER helpers [TODO] (M)"/>
      <node TEXT="Admin invitations flow [TODO] (S)"/>
      <node TEXT="M2M API-key auth (Argon2, per-key rate limits, rotation) [TODO NEW] (L)"/>
      <node TEXT="Session lifecycle, refresh rotation, re-auth for sensitive actions [TODO] (M)"/>
      <node TEXT="Frontend currently uses MOCK auth — replace with real [TODO] (M)"/>
    </node>
    <node TEXT="9 · Pricing Engine v2 (nightly batch) [NEW]">
      <node TEXT="Reference implementation pricing_engine.py [DONE] (M)"/>
      <node TEXT="Productionize batch (services/pricing-batch) [TODO NEW] (L)"/>
      <node TEXT="Five competitive sources">
        <node TEXT="eBay Browse API connector [TODO] (M)"/>
        <node TEXT="Best Buy developer API connector [TODO] (M)"/>
        <node TEXT="Amazon Renewed (aggregator/Keepa) connector [TODO] (M)"/>
        <node TEXT="Walmart Restored (aggregator) connector [TODO] (S)"/>
        <node TEXT="Back Market scheduled scrape (Scrapling) [TODO] (M)"/>
      </node>
      <node TEXT="Benchmark: match, ±30% trim, mean, locked ×0.9, confidence [TODO] (M)"/>
      <node TEXT="CTIA grade gating + per-vendor grade map [TODO NEW] (M)"/>
      <node TEXT="Waterfall: kit cost, floors, tier bands, per-tier flags [DONE ref / TODO prod] (M)"/>
      <node TEXT="Flag queue processing + admin actions [TODO NEW] (M)"/>
      <node TEXT="Tier-order + golden-file + unit tests [TODO] (L)"/>
      <node TEXT="Nightly scheduler (pg_cron / job runner) [TODO] (S)"/>
      <node TEXT="Contract note: drops cart-tier promotion (Agreement §1.3) — Change Order [DECISION] (S)"/>
    </node>
    <node TEXT="10 · Supplier Integrations — inbound (Python + Scrapling) [SCAFFOLD]">
      <node TEXT="Source-1 adapter structure (client, models, writer, sync, CLI) [SCAFFOLD] (M)"/>
      <node TEXT="Source-2 adapter structure [SCAFFOLD] (M)"/>
      <node TEXT="Real REST ingestion per supplier [TODO] (L)"/>
      <node TEXT="Scrapling HTML fallback (NotImplementedError today) [TODO] (M)"/>
      <node TEXT="Daily .xls/.csv feed parser (HYLA Daily Stock Report shape) [TODO NEW] (M)"/>
      <node TEXT="Idempotent upserts + advisory locks + sync-run rows [TODO] (M)"/>
      <node TEXT="Discrepancy detection → inventory-triage-agent [TODO] (S)"/>
    </node>
    <node TEXT="11 · Catalog Standard &amp; Import/Export [NEW — standard DONE]">
      <node TEXT="Product catalog standard doc [DONE NEW] (M)"/>
      <node TEXT="Canonical CSV import/export template [DONE NEW] (S)"/>
      <node TEXT="Import pipeline: normalize → validate → upsert (3 layers) [TODO NEW] (L)"/>
      <node TEXT="Vendor column-mapping profiles (per supplier) [TODO NEW] (M)"/>
      <node TEXT="Carrier normalization + CTIA grade mapping [TODO NEW] (S)"/>
      <node TEXT="Masked-quantity ('200+') + natural-key SKU minting [TODO NEW] (S)"/>
      <node TEXT="Internal canonical export (round-trippable, with cost) [TODO NEW] (M)"/>
      <node TEXT="Admin import/export UI (see branch 4) [TODO NEW] (L)"/>
    </node>
    <node TEXT="12 · Partner Inventory API — outbound feed [NEW]">
      <node TEXT="Design contract (PARTNER-INVENTORY-API.md) [DONE NEW] (M)"/>
      <node TEXT="services/partner-api service scaffold [TODO NEW] (M)"/>
      <node TEXT="API-key auth + scopes (inventory:read) [TODO NEW] (M)"/>
      <node TEXT="Subscriptions + price_source (cost_plus_margin | tier) [TODO NEW] (M)"/>
      <node TEXT="Projection recompute (per account × variant × location) [TODO NEW] (L)"/>
      <node TEXT="No-op suppression via content_hash [TODO NEW] (M)"/>
      <node TEXT="Webhook emitter (HMAC sign, sequence, retry+backoff, degraded) [TODO NEW] (L)"/>
      <node TEXT="Pull endpoints (cursor pagination, filters) [TODO NEW] (M)"/>
      <node TEXT="Margin resolution + floor invariant [TODO NEW] (M)"/>
      <node TEXT="Masking allow-list serializer + contract tests [TODO NEW] (M)"/>
      <node TEXT="Rate limits, SSRF deny-list on endpoint_url [TODO NEW] (S)"/>
      <node TEXT="Customer-facing Inventory API page [DONE mockup] (M)"/>
    </node>
    <node TEXT="13 · SmartPay Integration (inventory + fulfillment) [NEW]">
      <node TEXT="Integration contract (SMARTPAY-INTEGRATION.md) [DONE NEW] (M)"/>
      <node TEXT="OMP→SP feed at CONSUMER tier, Apple+Samsung, certified-only [TODO NEW] (M)"/>
      <node TEXT="Brand-inclusive filter + delivery ETA + carrier options [TODO NEW] (M)"/>
      <node TEXT="SP→OMP fulfillment write API (place/cancel/status) [TODO NEW] (L)"/>
      <node TEXT="Required Idempotency-Key (anti double-dropship) [TODO NEW] (M)"/>
      <node TEXT="fulfillment:write separate credential + mutual HMAC [TODO NEW] (M)"/>
      <node TEXT="Order status webhooks to SP [TODO NEW] (M)"/>
      <node TEXT="Reservation on accept (decrement projection) [TODO NEW] (M)"/>
      <node TEXT="Open: OMP↔SP margin formula [DECISION] (S)"/>
      <node TEXT="Open: blind-dropship / SP-branded packaging [DECISION] (S)"/>
      <node TEXT="Open: returns / RMA flow [TODO] (M)"/>
      <node TEXT="CUPE marketplace API validation (learnings) [TODO] (S)"/>
    </node>
    <node TEXT="14 · AI Agent Swarm (services/ai-api) [SCAFFOLD]">
      <node TEXT="Orchestrator + server (Fastify) [SCAFFOLD] (M)"/>
      <node TEXT="pricing-agent, tier-classifier, inventory-triage, customer-support [SCAFFOLD] (L)"/>
      <node TEXT="Real Anthropic Agent SDK wiring (no live calls yet) [TODO] (L)"/>
      <node TEXT="MCP tools (read-only Supabase) [SCAFFOLD] (M)"/>
      <node TEXT="Propose→admin-approve→apply loop + audit [TODO] (M)"/>
      <node TEXT="Guardrails: prompt-injection, cost caps, redaction, eval set [SCAFFOLD/TODO] (M)"/>
    </node>
    <node TEXT="15 · Payments — Stripe [SCAFFOLD]">
      <node TEXT="Checkout session creation [TODO] (M)"/>
      <node TEXT="stripe-webhook (paid → order transition, payments row) [SCAFFOLD] (M)"/>
      <node TEXT="Idempotency + replay protection (stripe_event_id) [TODO] (S)"/>
      <node TEXT="Refunds + reconciliation [TODO] (M)"/>
      <node TEXT="Stripe Tax (later milestone) [TODO] (M)"/>
    </node>
    <node TEXT="16 · Fulfillment &amp; Shipping [TODO]">
      <node TEXT="Dropship dispatch to supplier on paid order [TODO] (M)"/>
      <node TEXT="Shipments table + carrier tracking (FedEx/UPS) [TODO] (M)"/>
      <node TEXT="Delivery ETA from location [TODO NEW] (S)"/>
      <node TEXT="Landed cost (FedEx/UPS live rates) — Phase 2 [TODO] (M)"/>
      <node TEXT="Ground + insurance option [TODO] (S)"/>
    </node>
    <node TEXT="17 · Observability &amp; Ops [SCAFFOLD → TODO]">
      <node TEXT="Sentry SDK across services [SCAFFOLD] (S)"/>
      <node TEXT="PostHog product analytics [SCAFFOLD] (S)"/>
      <node TEXT="Structured logging + PII redaction [SCAFFOLD] (M)"/>
      <node TEXT="Ops runbook (sync fails, disputes, agent rollback) [TODO] (M)"/>
      <node TEXT="Supplier health + tier distribution reports [TODO] (M)"/>
    </node>
    <node TEXT="18 · Security &amp; Compliance [PARTIAL]">
      <node TEXT="Threat model (STRIDE) [DONE doc] (M)"/>
      <node TEXT="Data classification (incl. PII, partner, fulfillment) [DONE doc] (M)"/>
      <node TEXT="RLS on every table + tests [TODO] (L)"/>
      <node TEXT="Secrets management (VPS env, Keychain, rotation) [TODO] (S)"/>
      <node TEXT="Partner masking non-disclosure invariants + tests [TODO NEW] (M)"/>
      <node TEXT="Idempotency / anti double-dispatch [TODO NEW] (S)"/>
      <node TEXT="LGPD/GDPR/CCPA data-rights flows [TODO] (M)"/>
      <node TEXT="Pre-launch security pass [TODO] (M)"/>
    </node>
    <node TEXT="19 · DevOps / Infra / Deploy [SCAFFOLD]">
      <node TEXT="Dockerfiles (web, ai-api, supplier x2) [DONE] (M)"/>
      <node TEXT="docker-compose dev + prod (Caddy, registry) [DONE] (S)"/>
      <node TEXT="VPS provisioning + Caddy TLS [TODO] (M)"/>
      <node TEXT="CI pipeline (build/push images) — MISSING [TODO] (M)"/>
      <node TEXT="Supabase project link + migrations apply [TODO] (S)"/>
      <node TEXT="Deploy divergence: front on Vercel vs docs' VPS — DECIDE [DECISION] (S)"/>
      <node TEXT="Env/secret provisioning per service [TODO] (S)"/>
    </node>
    <node TEXT="20 · QA &amp; Testing [TODO]">
      <node TEXT="Frontend component/interaction tests [TODO] (M)"/>
      <node TEXT="Pricing golden-file + unit + tier-order tests [TODO NEW] (L)"/>
      <node TEXT="RLS / auth-bypass integration tests [TODO] (L)"/>
      <node TEXT="Partner API contract tests (masking, no-op, cross-tenant) [TODO NEW] (M)"/>
      <node TEXT="Fulfillment idempotency / double-submit tests [TODO NEW] (M)"/>
      <node TEXT="Supplier feed schema-drift tests [TODO] (M)"/>
      <node TEXT="E2E happy paths (checkout, portal, admin) [TODO] (L)"/>
    </node>
    <node TEXT="21 · Cross-cutting [PARTIAL]">
      <node TEXT="Mobile-first verified 320–428px [DONE frontend] (M)"/>
      <node TEXT="Accessibility (landmarks, focus, contrast, aria-live) [PARTIAL] (M)"/>
      <node TEXT="Performance budgets (pricing p50&lt;80ms, storefront) [TODO] (S)"/>
      <node TEXT="i18n: USD + English only at launch (Schedule A.3) [DONE scope] (S)"/>
      <node TEXT="Money as integer cents end-to-end [DONE convention] (S)"/>
    </node>
    <node TEXT="22 · Delivery Phases (budget roll-up)">
      <node TEXT="Phase 1 — Discovery &amp; Design (wireframes, spec, supplier audit) [DONE/PARTIAL]"/>
      <node TEXT="Phase 2 — Backend &amp; Integrations (DB, RLS, adapters, pricing, AI v1) [TODO core]"/>
      <node TEXT="Phase 3 — Frontend &amp; Portal (wire mockup to backend) [mockup DONE, wiring TODO]"/>
      <node TEXT="Phase 4 — QA, Deploy, Handover [TODO]"/>
      <node TEXT="Added scope (new SOW / change order)">
        <node TEXT="Partner Inventory API [NEW]"/>
        <node TEXT="Catalog Standard + Import/Export [NEW]"/>
        <node TEXT="Pricing Engine v2 (benchmark + CTIA) [NEW]"/>
        <node TEXT="SmartPay integration (inventory + fulfillment) [NEW]"/>
      </node>
      <node TEXT="Budget note: mockup UI is built; the bulk of remaining cost is backend wiring + the 4 new-scope workstreams"/>
    </node>
  </node>
</map>
