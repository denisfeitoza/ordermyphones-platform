# System Overview

> One-screen map of how the OrderMyPhones.com Platform is wired together.

## 1. High-level diagram

```
                          ┌────────────────────────────────────────────┐
                          │              Customers (Tiers 1–4)         │
                          │  iPhone, Android, B2C / Retailer / Wholesale│
                          └───────────────┬────────────────────────────┘
                                          │ HTTPS
                          ┌───────────────▼────────────────────────────┐
                          │   apps/web  (React 18 + Vite + TS)         │
                          │   Storefront · Customer Portal · Admin     │
                          │   Tailwind + Shadcn/UI                     │
                          │   TanStack Query for server state          │
                          └───────────────┬────────────────────────────┘
                                          │
                ┌─────────────────────────┼───────────────────────────────────┐
                │                         │                                   │
   ┌────────────▼────────────┐  ┌─────────▼────────────┐         ┌────────────▼────────────┐
   │ Supabase                │  │ services/ai-api      │         │ Stripe (Client-owned)   │
   │  - Postgres + RLS       │  │  Node + Agent SDK    │         │  Checkout · Webhooks    │
   │  - Auth                 │  │  Orchestrator        │         └────────────┬────────────┘
   │  - Storage              │  │  pricing-agent       │                      │
   │  - Realtime             │  │  inventory-triage    │                      │ signed webhooks
   │  - Edge functions       │  │  tier-classifier     │                      ▼
   │    · pricing-engine     │  │  customer-support    │       ┌──────────────────────────┐
   │    · tier-upgrade       │  │  (Anthropic models   │       │ supabase/functions/      │
   │    · stripe-webhook     │  │  via Agent SDK +     │       │   stripe-webhook         │
   └────────────┬────────────┘  │  OpenRouter fallback)│       └──────────────────────────┘
                │               └──────────┬───────────┘
                │                          │ MCP tools
                │ pg / service_role        │
                │                          │
   ┌────────────▼──────────────────────────▼─────────────────────────────────┐
   │ services/supplier-source-1   │ services/supplier-source-2               │
   │ (Python + Scrapling)         │ (Python + Scrapling)                     │
   │ US Dropship Provider A       │ US Dropship Provider B + Dubai Wholesale │
   │                              │ (consolidated)                           │
   └────────────┬──────────────────────────────┬─────────────────────────────┘
                │                              │
                ▼                              ▼
        Supplier API #1                Supplier API #2 (and DXB feed)

Observability: Sentry (errors) + PostHog (product analytics)
Hosting: Docker on dedicated VPS, Caddy/Traefik reverse proxy
```

## 2. Bounded contexts (DDD lens)

| Context | Owns | Lives in |
|---|---|---|
| **Catalog** | Products, variants, conditions, supplier-sourced inventory snapshots | Postgres + supplier adapters |
| **Pricing & Tiers** | Price rules, tier definitions, tier transitions | Postgres + `pricing-engine` edge function |
| **Sales** | Carts, orders, order items, refunds | Postgres + storefront/admin UIs |
| **Payments** | Stripe sessions, payment intents, webhooks, reconciliation | Stripe + `stripe-webhook` edge function |
| **Fulfillment** | Shipments, dropship dispatch, tracking | Supplier adapters + admin UI |
| **Identity & Access** | Users, accounts, roles, sessions | Supabase Auth + RLS |
| **Customer Engagement** | Tickets, AI-assisted replies, notifications | AI service + admin UI |
| **Analytics** | Sales reports, supplier health, tier distribution | Postgres views + PostHog + Sentry |

Authorization lives in the application layer (edge functions and service code) **and** in the database via RLS. Both must agree before any mutation succeeds.

## 3. Data flow narratives

### 3.1 Customer checkout (happy path)

1. Storefront calls `pricing-engine` with `{ customer_id, cart }`.
2. Edge function returns line + cart totals at the **effective tier** for this cart (cart can lift the tier above the customer's stored tier; see [PRICING-ENGINE.md](PRICING-ENGINE.md)).
3. Customer confirms cart. Storefront calls a server action that creates a `draft` order and a Stripe checkout session.
4. Customer completes payment on Stripe-hosted UI.
5. `stripe-webhook` receives `checkout.session.completed`, verifies signature, transitions order to `paid` and writes a `payments` row.
6. `tier-upgrade` is invoked after order paid; cumulative-unit thresholds re-evaluated; promotion (or none) written to `audit_log`.
7. Fulfillment job triggers the appropriate supplier adapter to dispatch the dropship request.

### 3.2 Supplier sync (scheduled)

1. `pg_cron` triggers each supplier adapter every N minutes.
2. Adapter acquires `pg_advisory_lock((supplier_id, sync_kind))`.
3. REST endpoints are called; Scrapling fallback handles any feed that requires HTML parsing.
4. Records upserted with idempotency keys; row counts written to `supplier_sync_runs`.
5. AI `inventory-triage-agent` is invoked when discrepancies are detected (e.g. same SKU shows different prices across feeds).

### 3.3 AI agent action (admin-supervised)

1. Admin clicks "Suggest action" in the dashboard.
2. UI calls `services/ai-api/` (Agent SDK orchestrator).
3. Orchestrator routes to the right agent; the agent uses MCP tools (read-only on the Platform DB by default).
4. Agent returns a structured proposal `{ action, args, rationale, rollback_metadata }`.
5. Admin clicks Approve. The Platform applies the action server-side, validating every arg against business invariants.
6. `audit_log` records `{ agent, proposal, applied_by, applied_at, before, after }`.

## 4. Cross-cutting concerns

- **Validation:** server-side on every mutation. Client-side validation is UX only.
- **Secrets:** env vars on the VPS + Supabase project; never in the client bundle, never logged.
- **Mobile-first:** every UI verified at 320–428px before desktop layouts are touched.
- **Money:** integer cents end-to-end. No floats in pricing math. Currency is USD at launch (Schedule A.3).
- **Audit:** every state change that is not a read goes to `audit_log` with `(actor_id, action, target_table, target_id, before, after, ip, user_agent)`.
- **Rate limiting:** per-IP on the edge functions; per-user on the AI service.

## 5. Where to look next

- [`DATA-MODEL.md`](DATA-MODEL.md) — entity-by-entity schema with field types.
- [`AUTH-AND-RLS.md`](AUTH-AND-RLS.md) — auth flows and per-table RLS policy outline.
- [`PRICING-ENGINE.md`](PRICING-ENGINE.md) — tier math and the cart-vs-customer tier contract.
- [`DEPLOYMENT.md`](DEPLOYMENT.md) — VPS topology, container layout, DNS, TLS.
- [`OBSERVABILITY.md`](OBSERVABILITY.md) — logging, metrics, alerts, runbook.
- [`../ai/AGENT-SWARM-OVERVIEW.md`](../ai/AGENT-SWARM-OVERVIEW.md) — orchestrator, agents, MCP surface.
- [`../security/THREAT-MODEL.md`](../security/THREAT-MODEL.md) — assets, threats, mitigations.
