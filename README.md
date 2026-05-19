# OrderMyPhones.com — E-commerce Platform

> **Status:** Architecture & scoping (Phase 0). Code in this repository is the **engineering scaffold** that pins down the design contract before Phase 1 execution. Boilerplate compiles; business logic ships in the four contracted phases (see [`docs/phases/`](docs/phases/)).

Custom e-commerce platform for the U.S. mobile devices market with built-in international expansion capacity. Tier-based pricing, real-time multi-supplier inventory aggregation, AI-assisted operations, branded customer portal, and a complete admin back-office.

This monorepo is the deliverable surface for the engagement between **VINDIAI** (Developer) and **Order My Phones LLC** (Client). The full agreement lives in [`docs/contract/SOFTWARE_DEVELOPMENT_AGREEMENT.md`](docs/contract/SOFTWARE_DEVELOPMENT_AGREEMENT.md).

---

## 1. What's in the box

| Path | What it is |
|---|---|
| [`apps/web/`](apps/web/) | Customer-facing storefront + admin dashboard. **React 18 + Vite + TypeScript + Tailwind + Shadcn/UI.** Mobile-first, fully responsive. |
| [`services/ai-api/`](services/ai-api/) | AI orchestrator + agent swarm. Native actions (pricing decisions, tier upgrades, inventory triage, customer-support drafts) executed on the user's behalf via Anthropic Agent SDK. |
| [`services/supplier-source-1/`](services/supplier-source-1/) | Integration with **Supplier API #1** (U.S.-based dropship provider). Hybrid REST + Scrapling fallback. |
| [`services/supplier-source-2/`](services/supplier-source-2/) | Integration with **Supplier API #2** (U.S.-based dropship + Dubai-based wholesale, consolidated). Hybrid REST + Scrapling fallback. |
| [`packages/shared-types/`](packages/shared-types/) | Domain types shared between frontend, AI service, and adapters. Single source of truth for `PricingTier`, `Product`, `OrderStatus`, etc. |
| [`supabase/`](supabase/) | Database migrations, RLS policies, edge functions (pricing engine, tier upgrade, Stripe webhook), seed data. **RLS enabled on every table.** |
| [`docs/`](docs/) | Contract, phase-by-phase plan, architecture, integration playbooks, AI swarm design, security model, UX notes. |

---

## 2. Contract & scope (one-screen summary)

- **Fee:** USD 12,000 total, four equal monthly installments of USD 3,000.
- **Timeline:** ~120 days from the Effective Date, executed in 4 phases.
- **Suppliers in scope:** 3 supplier feeds delivered through 2 API integrations (2 U.S.-based dropship + 1 Dubai-based wholesale).
- **Tiers (auto-promoted by cumulative volume):**
  - Tier 1 Consumer — 1–10 units (retail)
  - Tier 2 Retailer — 10–50 units (reseller discount)
  - Tier 3 Multi-Store — 50–400 units (distributor)
  - Tier 4 Wholesale — 401+ units (bulk)
- **Maintenance:** post-delivery monthly fee defined by written addendum (§2.3 of the Agreement).

Full legal terms: [`docs/contract/SOFTWARE_DEVELOPMENT_AGREEMENT.md`](docs/contract/SOFTWARE_DEVELOPMENT_AGREEMENT.md).

---

## 3. Phase plan

| Phase | Window | Deliverable | Doc |
|---|---|---|---|
| **1. Discovery & Design** | Weeks 1–3 | UX/UI wireframes, refined tech spec, supplier API audit | [`docs/phases/PHASE-1-DISCOVERY-AND-DESIGN.md`](docs/phases/PHASE-1-DISCOVERY-AND-DESIGN.md) |
| **2. Backend & Integrations** | Weeks 4–8 | Database, RLS, supplier adapters, pricing engine, AI agents v1 | [`docs/phases/PHASE-2-BACKEND-AND-INTEGRATIONS.md`](docs/phases/PHASE-2-BACKEND-AND-INTEGRATIONS.md) |
| **3. Frontend & Portal** | Weeks 9–13 | Landing, catalog, cart, checkout, customer portal, admin dashboard | [`docs/phases/PHASE-3-FRONTEND-AND-PORTAL.md`](docs/phases/PHASE-3-FRONTEND-AND-PORTAL.md) |
| **4. QA, Deploy, Final Delivery** | Weeks 14–17 | E2E tests, security pass, production deploy, handover | [`docs/phases/PHASE-4-QA-AND-DEPLOYMENT.md`](docs/phases/PHASE-4-QA-AND-DEPLOYMENT.md) |

---

## 4. Technology stack

| Concern | Choice | Why |
|---|---|---|
| Frontend framework | React 18 + Vite + TypeScript (strict) | Mature ecosystem, fast HMR, type-safe |
| Styling | Tailwind CSS + Shadcn/UI | Accessible, themeable, copy-paste components owned by the project |
| Server state | TanStack Query | Cache invalidation, optimistic updates, retries |
| Backend | Supabase (Postgres + Auth + Storage + Realtime) | RLS-first, auth and DB in one platform, edge functions for low-latency mutations |
| Payments | Stripe (primary), gateway-agnostic adapter for future providers | PCI-out-of-scope, account opened in Client's name |
| AI gateway | Anthropic Agent SDK + OpenRouter fallback | Tool-calling, prompt caching, multi-model routing |
| Web scraping | [Scrapling](https://github.com/D4Vinci/Scrapling) | Adaptive selectors (survives supplier HTML drift), stealth fetchers, async-first |
| Observability | Sentry (errors) + PostHog (product analytics) | Production-grade ops with low overhead |
| Hosting | Docker on dedicated VPS, Caddy/Traefik reverse proxy | Cost-predictable, no PaaS lock-in, full SSH access |
| Container orchestration | Docker Compose (single-host), upgradable to Swarm/k3s | Pragmatic for the scale of this engagement |

Detailed architecture: [`docs/architecture/SYSTEM-OVERVIEW.md`](docs/architecture/SYSTEM-OVERVIEW.md).

---

## 5. Repository layout

```
ordermyphones-platform/
├── apps/
│   └── web/                       React 18 + Vite + TS storefront & admin
├── services/
│   ├── ai-api/                    AI orchestrator + agents (Node + Agent SDK)
│   ├── supplier-source-1/         Source #1 adapter (Python + Scrapling)
│   └── supplier-source-2/         Source #2 adapter (Python + Scrapling)
├── packages/
│   └── shared-types/              TS types shared across apps and services
├── supabase/                      Migrations, RLS, edge functions, seed
└── docs/
    ├── contract/                  Signed Agreement + addenda
    ├── phases/                    4-phase delivery plan
    ├── architecture/              System overview, data model, deploy, observability
    ├── integrations/              Supplier APIs, Stripe, shipment, webhooks
    ├── ai/                        Agent swarm design and guardrails
    ├── security/                  Threat model, data classification, compliance
    └── ux/                        Information architecture, portal, admin
```

---

## 6. Running locally (preview only)

> The scaffold compiles end-to-end. Business logic and supplier credentials are stubbed — exercise the dev servers to inspect the contract, not to transact.

```bash
# 1. Frontend (storefront + admin shell)
cd apps/web
npm install
cp .env.example .env.local        # fill in Supabase URL + anon key
npm run dev                       # http://localhost:5173

# 2. AI service (agent swarm)
cd services/ai-api
npm install
cp .env.example .env              # fill in ANTHROPIC_API_KEY
npm run dev                       # http://localhost:8787

# 3. Supplier adapters
cd services/supplier-source-1     # or supplier-source-2
python -m venv .venv && source .venv/bin/activate
pip install -e ".[fetchers]"
scrapling install                 # downloads stealth browser
cp .env.example .env
python -m supplier_source_1.sync --dry-run

# 4. Supabase (local stack via Supabase CLI)
cd supabase
supabase start
supabase db reset                 # applies migrations + seed
```

Full container setup: `docker compose up` from the repository root (see [`docker-compose.yml`](docker-compose.yml)).

---

## 7. For the Client

This repository is the **engineering reference** for the engagement. The four phase documents in [`docs/phases/`](docs/phases/) map 1:1 to the deliverables listed in **Schedule B** of the Agreement, and the architecture documents pin down how each clause of **Section 1** and **Schedule A** is implemented.

Direct contact during the engagement:

- **Developer:** Denis Feitoza — VINDIAI — _Refer to the Agreement for the official email._
- **Client:** Abdu Abdelrahman — Order My Phones LLC — abdu@ordermyphones.com — +1 (310) 598-9908.

Any modification to scope, timeline, or fees is handled via a written Change Order per **Section 8** of the Agreement.

---

## 8. Confidentiality

This repository is **private** and the Agreement (Section 6) keeps all non-public information confidential for a period of three (3) years after termination. Do not share invitation links, clones, or excerpts outside the parties named in the Agreement.
