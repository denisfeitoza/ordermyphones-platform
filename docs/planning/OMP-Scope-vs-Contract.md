# Scope vs. Contract — What's In, What's Out

> Compares everything designed/built across recent sessions against the signed **Software Development and Services Agreement** (USD 12,000 fixed, 120 days). Flags what falls **outside the original scope** and therefore needs a **Change Order (Agreement §8)** before it is billed or built.
>
> Purpose: a clean line for the OMP conversation between "already contracted" and "new work to quote."

---

## 1. Verdict in one paragraph

The **core platform** (storefront, catalog, cart/checkout, customer portal, admin dashboard, Stripe, inbound supplier integration, tier pricing, the eight core modules) is **in scope** and matches the contract — most of it exists as a working mockup, with backend wiring pending. Three substantial workstreams we designed are **outside the contract**: the **AI agent swarm**, the **competitive-benchmark Pricing Engine v2**, and the **generalized multi-partner Inventory API** (beyond the two named customer integrations). Separately, the **Pricing v2 tier model conflicts with the contract's §1.3** (it drops the automatic volume-based upgrade and renames/re-bounds the tiers) and must be reconciled, not just added.

---

## 2. In scope — contracted and covered

| Contract clause | Deliverable | Where it stands |
|---|---|---|
| §1.2, §1.5 | Storefront: branded landing, filtered catalog, smart search, cart with tier price, iPhone + CPO + Android | ✅ Mockup built; backend wiring TODO |
| §1.5 | 3D product views "where source assets allow" | ◐ Fallback path in mockup; assets pending |
| §1.5, §1.8 | Real-time order tracking / Shipment Tracking | ◐ Data model + mockup; carrier wiring TODO |
| §1.6 | Admin dashboard: customers, orders, inventory, price config, API logs, reporting | ✅ Mockup built; wiring TODO |
| §1.7 | Customer portal: order history, tier + progress, addresses, payment, settings | ✅ Mockup built; wiring TODO |
| §1.8 | Core modules: Stock, Payment, Shipment, Auth, Sales, Customer Support, Analytics, Inventory Sync | ◐ Schema + mockup; logic TODO |
| §1.4, A.2 | Inbound supplier integration (model, color, price, grade, availability), auto inventory updates, **dropship fulfillment workflow** | ◐ Adapters scaffolded (Assurant/HYLA, Mannapov + Dubai); real ingestion TODO |
| §1.4 | Customer integrations — **SmartPay** (one of the two named) + dropship fulfillment write | ◐ Designed (SMARTPAY-INTEGRATION.md); build TODO — **conditional, see §5.1** |
| §1.9, A.1 | Custom e-commerce, Stripe (+future gateways), relational DB w/ realtime inventory, RBAC, mobile-optimized | ◐ Stack chosen + partly built |
| §1.3 | Four-tier pricing | ⚠️ Built, but **deviates** — see §4 |

Legend: ✅ built (mockup) · ◐ designed/partial · ⚠️ conflict.

---

## 3. OUT OF SCOPE — needs a Change Order (§8)

These are real, substantial builds we designed that the Agreement does **not** cover. Each should be quoted separately.

### 3.1 AI Agent Swarm — **out of scope** 🔴
- **What:** orchestrator + `pricing-agent`, `tier-classifier-agent`, `inventory-triage-agent`, `customer-support-agent`, MCP tools, guardrails, eval set (`services/ai-api/`, `docs/ai/*`).
- **Why out:** Section 1 and Schedule A contain **no AI deliverable**. AI is mentioned only in the recital ("Developer is engaged in… AI-driven systems") — a description of the Developer, **not** a scoped deliverable. "Customer Support" is a core module (§1.8) but the contract does not specify an AI-assisted implementation.
- **Note:** the largest single new workstream. If the client wants it, quote it; if not, it can be dropped with zero contract impact.

### 3.2 Pricing Engine v2 — competitive benchmarking — **out of scope** 🔴
- **What:** nightly market-benchmark pricing from five paid/free marketplace sources (eBay, Best Buy, Amazon Renewed, Walmart Restored, Back Market), trimmed-mean benchmark, CTIA grade gating, kitting-cost model, profit floors, flag queue, and the paid data subscriptions (~$150–200/mo).
- **Why out:** the contract's pricing is **tier-based discount/markup rules** (§1.3, §1.6 "pricing rules per customer tier") — a configuration the admin sets, not a market-intelligence subsystem that scrapes competitors nightly. None of the benchmark sources, the CTIA engine, or the recurring data-feed cost appear in the Agreement.
- **Note:** this is the "Pricing Engine v2" deck the client themselves provided. It is a genuine upgrade, but it is **new build + new recurring cost** → Change Order. The recurring data-feed cost also needs a home in the §2.3 maintenance fee.

### 3.3 Generalized Partner Inventory API (beyond the two named integrations) — **partly out of scope** 🟡
- **In scope:** integrating **SmartPay and Qpay** as customers (§1.4 names both, "up to two (2)").
- **Out of scope:** turning that into a **general reseller-feed product** — multi-partner API-key issuance/rotation, per-partner margin-rule engine, webhook delivery infrastructure with retry/backoff, no-op suppression, masking allow-list, SSRF controls, and the **customer-facing self-serve "Inventory API" portal page**. That is more than "integrate with SmartPay and Qpay"; it is a platform capability to onboard arbitrary partners.
- **Rule of thumb:** delivering the two named integrations = in scope. Everything that lets a *third, fourth, Nth* partner self-onboard = Change Order.

---

## 4. Conflicts with the contract — reconcile, don't just add ⚠️

These are places where what we designed **contradicts** a contracted behavior. They are not "extra features"; they change a term and need written sign-off (Change Order) to be legitimate — otherwise the delivered platform won't match §1.3.

| Contract §1.3 (as signed) | What Pricing v2 designed | Action |
|---|---|---|
| Tiers **auto-upgrade as cumulative purchase volume increases** | Admin **manually assigns** the tier; no cumulative auto-upgrade | Either build the auto-upgrade as contracted, **or** Change Order to formalize admin-assigned tiers |
| T3 = **Multi-Store** (50–400), T4 = **Wholesale** (401+) | T3 = **Wholesale** (50–399), T4 = **Distributor** (400+) | Rename + re-bound; confirm client wants the new labels/thresholds |
| Cart-tier promotion (earlier internal design) | Dropped in v2 | Already flagged in PRICING-ENGINE.md §0; confirm |

---

## 5. Watch items (gray areas / risks to the fixed price)

### 5.1 Customer-integration tech-stack condition (§1.4)
SmartPay/Qpay are included **only if they use the same underlying tech stack as one of the four covered supplier API tech stacks.** If SmartPay's ideal API (which *they* are drafting) needs a **distinct** stack, it becomes a Change Order per §1.4. Do not assume; confirm against their spec when it arrives.

### 5.2 Qpay is named in the contract but **not yet designed**
The Agreement names **Qpay Marketplace** and **SmartPay**. Our work covered **SmartPay** in depth and referenced **"CUPE marketplace"** (from the meeting) — **Qpay does not appear anywhere in our docs**. Confirm whether Qpay = CUPE (a rename) or a separate integration. If separate, it is still in scope (it's the second named customer), but it needs designing — and it carries the same §5.1 tech-stack condition.

### 5.3 The four-supplier-tech-stack cap (§1.4, A.1)
The cap is **four (4) distinct supplier API tech stacks**, covering supplier *and* customer feeds. Current sources: Assurant, HYLA (the daily stock report — note HYLA was acquired by Assurant, so it may be one stack or two), Mannapov, Dubai wholesale. Plus SmartPay + Qpay as customer feeds sharing those stacks. **Track the distinct-stack count** — a fifth distinct stack (supplier or customer) is a Change Order.

### 5.4 Catalog Standard & Import/Export tooling — mostly in scope
Bulk `.xls/.csv` import with mapping profiles, validation, and canonical export sits under "Inventory control / Inventory Sync" (§1.6, §1.8). Fine as delivery detail. The formal *product catalog standard* document + round-trippable export tooling is an elaboration, not a separate billable — **keep in scope** unless the client asks for a standalone data-migration/PIM tool (which A.3 already excludes as "legacy data migration").

### 5.5 Live carrier rate / landed cost (Phase 2)
Shipment **tracking** is in scope (§1.8). **Live FedEx/UPS rate shopping / landed-cost calculation** is beyond tracking — we already marked it Phase 2. If pursued, scope it explicitly.

---

## 6. Also confirm against Schedule A.3 (already-excluded items)
The contract already lists these as **out unless Change Order** — we are **not** doing them, which is correct:
- Native mobile apps (iOS/Android) — not building. ✅
- Custom ERP integrations beyond the 4 supplier stacks — not building. ✅
- Legacy data migration — not building. ✅
- Multi-language / multi-currency beyond English/USD — **USD-only is baked in** (integer cents, `currency='USD'`). ✅ consistent.

---

## 7. Recommendation

Bundle the OUT items into **one Change Order** with three line items the client can accept or decline independently:

1. **AI Agent Swarm** (orchestrator + 4 agents + guardrails) — optional, high value, fully separable.
2. **Pricing Engine v2** (competitive benchmark + CTIA gating + flag queue) + its recurring data-feed cost into §2.3 — this is the client's own deck, so likely a yes; just needs to be papered.
3. **Partner Inventory API platform** (multi-partner beyond SmartPay/Qpay + self-serve portal) — quote the delta above the two named integrations.

And **one reconciliation note** (not a new charge, but a written §8 amendment): the §1.3 tier logic change (auto-upgrade dropped, tiers renamed/re-bounded).

Everything else in Section 1 / Schedule A stays in the original USD 12,000 fixed fee.
