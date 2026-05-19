# Phase 1 — Discovery, Technical Specification & UX/UI Design

**Window:** Weeks 1–3 (≈ Day 1 – Day 21 of the Effective Date)
**Maps to Agreement:** §1.1, §1.5, §1.6, §1.7, §3.2 (Phase 1), Schedule A.

---

## 1. Goal

Lock down the **product surface** and the **technical contract** before any backend code is written. By the end of Phase 1 the Client has signed off on:

- The user journeys (Consumer → Wholesale) end-to-end, including tier promotion moments.
- The information architecture of the storefront, customer portal, and admin dashboard.
- The supplier API contract (real fields, real responses, real auth).
- The data model and pricing rules in writing.
- A high-fidelity, mobile-first UI for the landing, catalog, product page, cart/checkout, customer portal, and key admin views.

Everything downstream in Phases 2–4 implements what is fixed here. Re-litigation of design in later phases is handled via Change Order.

---

## 2. Scope (in scope)

- **Discovery workshops** with the Client (2 sessions, ~90 min each) to elicit:
  - Tier promotion edge cases (mixed orders, returns, time windows).
  - Supplier idiosyncrasies (rate limits, schema gaps, sandbox availability).
  - Operational team workflow for the admin dashboard.
  - Brand voice, visual identity, and competitor benchmarks.
- **Supplier API audit.** For each of the 2 supplier APIs (3 feeds):
  - Read every endpoint we'll consume.
  - Pull a real sample response, document edge cases (missing fields, inconsistent units, currency normalization).
  - Confirm sandbox credentials with the Client per Agreement §4.
- **Information architecture and content model.**
  - Catalog taxonomy (brand → model → variant → condition → grade).
  - Order lifecycle states and their visible UI mappings.
  - Customer tier model and the visible cues for "you are X units away from the next tier."
- **UX wireframes (low-fi)** for: landing, catalog with filters, product detail with 3D viewer slot, cart, checkout, customer portal (orders, tier progress, addresses, payment methods), admin dashboard skeleton.
- **High-fidelity UI** for: mobile + desktop of the top 6 screens (landing, catalog, product, cart, checkout, customer portal home). Admin dashboard kept at low-fi until Phase 3 unless the Client requests otherwise.
- **Design system primitives:** typography scale, color palette, spacing rules, motion tokens, component library bootstrap (Shadcn-on-Tailwind variants).
- **Technical specification document** refining Schedule A:
  - Final database entity list with field types.
  - RLS policy outline per table.
  - API surface (REST/GraphQL boundary, endpoint inventory).
  - AI agent roster and tool surface (which actions the swarm can take natively).
- **Risk register** for the engagement (technical + delivery).

---

## 3. Out of scope (this phase)

- Production code for any feature.
- Hi-fi admin dashboard screens (kept at low-fi unless prioritized by Client).
- Native mobile apps (out of scope of the Agreement entirely — Schedule A.3).
- Migration of legacy data (also out of scope per Schedule A.3).

---

## 4. Entry criteria

- Agreement signed and Installment 1 invoice issued.
- Client point of contact named per Agreement §4.
- Provisional supplier credentials (sandbox or test) received from the Client, or scheduled to be requested in week 1.
- Brand assets baseline (logo, name, market positioning) shared by the Client.

---

## 5. Deliverables

| Deliverable | Format | Location |
|---|---|---|
| Discovery workshop notes | Markdown + recording | `docs/phases/phase-1-artifacts/discovery-notes.md` |
| Supplier API audit | Markdown per supplier | [`docs/integrations/SUPPLIER-SOURCE-1.md`](../integrations/SUPPLIER-SOURCE-1.md), [`SUPPLIER-SOURCE-2.md`](../integrations/SUPPLIER-SOURCE-2.md) |
| Information architecture | Markdown + diagram | [`docs/ux/INFORMATION-ARCHITECTURE.md`](../ux/INFORMATION-ARCHITECTURE.md) |
| Data model | Markdown + ER diagram | [`docs/architecture/DATA-MODEL.md`](../architecture/DATA-MODEL.md) |
| Pricing engine spec | Markdown | [`docs/architecture/PRICING-ENGINE.md`](../architecture/PRICING-ENGINE.md) |
| Auth + RLS spec | Markdown | [`docs/architecture/AUTH-AND-RLS.md`](../architecture/AUTH-AND-RLS.md) |
| AI swarm design | Markdown | [`docs/ai/AGENT-SWARM-OVERVIEW.md`](../ai/AGENT-SWARM-OVERVIEW.md), [`ORCHESTRATOR.md`](../ai/ORCHESTRATOR.md), [`AGENTS-ROSTER.md`](../ai/AGENTS-ROSTER.md) |
| Wireframes | Figma file (link in artifacts) | Figma project: _OrderMyPhones — Lo-Fi_ |
| Hi-fi UI (top 6 screens) | Figma file (link in artifacts) | Figma project: _OrderMyPhones — Hi-Fi_ |
| Design system primitives | Figma library + Tailwind tokens | `apps/web/tailwind.config.ts` + Figma library |
| Threat model v1 | Markdown | [`docs/security/THREAT-MODEL.md`](../security/THREAT-MODEL.md) |

---

## 6. Exit criteria

The phase is accepted when **all** of the following are true:

- Hi-fi screens for landing, catalog, product, cart, checkout, customer portal are signed off in writing by the Client.
- Supplier API audit confirms that the 2 integrations can deliver the 3 feeds required by the contract; any gap is documented with an action plan or a proposed Change Order.
- The data model and pricing engine spec are reviewed and signed off.
- The AI swarm design (orchestrator + agents) is signed off.
- Risk register reviewed; mitigations agreed for any "high" risk.
- Phase 2 backlog (estimable, mapped to weeks 4–8) is approved.

---

## 7. Workstreams & sequencing

Three workstreams run partially in parallel:

```
W1 (UX)            ──[ Discovery ]──[ Lo-fi wireframes ]──[ Hi-fi top 6 ]──┐
                                                                          ├──> Phase 1 review
W2 (Architecture)  ─────[ Data model ]──[ AI swarm ]──[ Threat model ]────┤
                                                                          │
W3 (Integrations)  ──[ Supplier audit ]──[ Sandbox credentials ]──────────┘
```

- W1 leads — UX decisions block data-model and AI agent design at the edges.
- W3 starts immediately and runs in parallel; supplier limitations may force adjustments to W1/W2.

---

## 8. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Supplier sandbox credentials delayed by the Client | Medium | High (pushes Phase 2 right) | Begin commercial outreach in week 1; in parallel write integration code against the documented spec. |
| Supplier API documentation incomplete or mismatched with reality | Medium | High | Capture real responses; document divergence in the audit; propose Change Order if a feed is materially different from §1.4. |
| Tier promotion edge cases (returns, refunds, mixed orders) under-specified | High | Medium | Phase 1 workshop dedicates a session to edge cases; result is the [pricing engine spec](../architecture/PRICING-ENGINE.md). |
| Brand assets not provided in time for hi-fi UI | Medium | Medium | Run hi-fi with placeholder identity; lock brand at end of week 2; final palette applied as a token swap, not a re-design. |
| Client expectation drift on 3D viewer scope | Low | Medium | Treat 3D as "where source assets allow" (per Agreement §1.5); spec a graceful fallback for products without 3D assets. |

---

## 9. Client interaction points

- **Day 1 — Kickoff (60 min).** Confirm contacts, schedule, supplier credential request.
- **Week 1 — Discovery workshop #1 (90 min).** Personas, tier journeys, operational workflow.
- **Week 2 — Discovery workshop #2 (90 min).** Edge cases, admin needs, brand & visual identity.
- **Week 2 — Lo-fi review (60 min).** Walkthrough of wireframes.
- **Week 3 — Hi-fi review (60 min).** Walkthrough of hi-fi screens.
- **End of Phase 1 — Phase review (90 min).** Sign-off on all exit criteria; green light Phase 2.

Per Agreement §4, Client feedback on each milestone is consolidated in writing within five (5) business days.

---

## 10. Artifacts produced in the repository

- `docs/integrations/SUPPLIER-SOURCE-1.md`
- `docs/integrations/SUPPLIER-SOURCE-2.md`
- `docs/architecture/SYSTEM-OVERVIEW.md` (initial draft)
- `docs/architecture/DATA-MODEL.md`
- `docs/architecture/AUTH-AND-RLS.md`
- `docs/architecture/PRICING-ENGINE.md`
- `docs/ai/AGENT-SWARM-OVERVIEW.md`
- `docs/ai/ORCHESTRATOR.md`
- `docs/ai/AGENTS-ROSTER.md`
- `docs/security/THREAT-MODEL.md`
- `docs/ux/INFORMATION-ARCHITECTURE.md`
- `apps/web/tailwind.config.ts` (design tokens)
- `packages/shared-types/src/` (initial type contracts)
