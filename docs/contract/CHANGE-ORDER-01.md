# CHANGE ORDER NO. 01

**to the Software Development and Services Agreement — OrderMyPhones.com E-commerce Platform**

| | |
|---|---|
| **Developer** | VINDIAI — CNPJ 39.243.933/0001-45 — Denis Feitoza |
| **Client** | Order My Phones LLC — Abdu Abdelrahman, President |
| **Underlying Agreement** | Software Development and Services Agreement, effective [EFFECTIVE DATE] |
| **Change Order No.** | 01 |
| **Date** | ____ / ____ / ______ |

This Change Order ("CO-01") is issued pursuant to **Section 8 (Change Orders)** of the Agreement. It documents modifications to the scope, deliverables, timeline, and fees. Capitalized terms not defined here have the meaning given in the Agreement. Except as expressly modified below, all terms of the Agreement remain in full force and effect. No work described in Part A shall commence until this CO-01 is executed by both Parties.

> **All figures below marked _[proposed]_ are the Developer's estimate for discussion and must be confirmed by the Developer before signature.** Time estimates assume timely Client cooperation (Agreement §4) and extend the delivery timeline on a day-for-day basis per Agreement §3.3.

---

## PART A — Added Scope (each item may be accepted or declined independently)

### Item A.1 — AI Operations Agent Swarm
**Status against Agreement:** Outside original scope. Section 1 and Schedule A contain no AI deliverable; AI appears only in the recitals as a description of the Developer.

**Description & deliverables**
- Orchestrator service coordinating specialized agents that operate inside the Platform on the operator's behalf.
- Agents: pricing assistant, tier classifier, inventory-discrepancy triage, customer-support draft.
- Least-privilege tool access, propose → admin-approve → apply workflow, full audit trail.
- Guardrails: prompt-injection resistance, per-call and per-day cost caps, PII redaction, evaluation set.

**Additional time:** _[proposed]_ ___ business days (≈ 4–6 weeks)
**Additional fee (one-time):** USD _[proposed]_ ________
**Recurring impact:** LLM/model usage costs to be folded into the Section 2.3 monthly fee.

**Accepted?** ☐ Yes ☐ No — Client initials: ____

---

### Item A.2 — Pricing Engine v2 (competitive-benchmark pricing)
**Status against Agreement:** Outside original scope. Section 1.3 / 1.6 contemplate tier-based pricing **rules** configured by the admin, not a market-intelligence subsystem. Based on the Client-provided "Pricing Engine v2" specification.

**Description & deliverables**
- Nightly pricing batch computing a price for each SKU at all four tiers.
- Competitive benchmark from five marketplace sources (eBay, Best Buy, Amazon Renewed, Walmart Restored, Back Market): trimmed-mean, outlier trim, confidence scoring.
- CTIA grade gating (per-vendor grade mapping), kitting-cost model, per-tier profit floors.
- Admin flag queue (override / acknowledge / watch) with audit.
- Golden-file, unit, and tier-order test suites.

**Additional time:** _[proposed]_ ___ business days (≈ 4–5 weeks)
**Additional fee (one-time):** USD _[proposed]_ ________
**Recurring impact:** third-party market-data subscriptions (≈ USD 150–200 / month) to be included in the Section 2.3 monthly fee, or contracted directly by the Client under Section 2.7.

**Accepted?** ☐ Yes ☐ No — Client initials: ____

---

### Item A.3 — Partner Inventory API Platform (beyond the two named customer integrations)
**Status against Agreement:** Partly outside scope. Integrating the two named customer platforms (**SmartPay** and **Qpay Marketplace**, Section 1.4) is **included in the base Agreement** and is **not** charged here. This item covers only the **generalized platform capability** above those two integrations.

**Description & deliverables (the increment only)**
- Multi-partner API-key issuance, rotation, and revocation for partners beyond SmartPay and Qpay.
- Per-partner margin-rule engine (distinct from tier pricing).
- Outbound webhook delivery infrastructure: HMAC signing, sequencing, retry/backoff, degraded-state handling, no-op suppression.
- Supplier-identity/cost masking (allow-list serializer) and SSRF controls.
- Customer-facing self-serve "Inventory API" portal page (key management, feed view, docs).

**Additional time:** _[proposed]_ ___ business days (≈ 3–4 weeks)
**Additional fee (one-time):** USD _[proposed]_ ________

**Accepted?** ☐ Yes ☐ No — Client initials: ____

---

### Item A.4 — Partner order-intake (adapt to the partner's own order API)
**Status against Agreement:** Outside base scope. The base Agreement provides order placement through **OMP's standard** order API (partner conforms). This item covers the opposite direction contemplated at the working call: where a partner (e.g. SmartPay) places orders through **its own** API and **OMP adapts to that spec** (Section 1.4: "OMP will adapt to their needs"). It is the mirror of the inbound supplier integration, on the sales side.

**Description & deliverables**
- Order-intake service supporting both modes — OMP standard **and** adapt-to-partner.
- **Per-partner adapter:** OMP conforms to the partner's order API (their auth, payload, error and status semantics), translating each order into the OMP order domain, with idempotency and validation, and pushing acknowledgements/status back **in the partner's format**.
- Per-partner mapping profile + contract tests against the partner's spec.

**High complexity + variable cost:** the partner dictates the contract, and this **scales per partner** — each additional customer whose order API OMP must adapt to is its own adapter. The two named customers (SmartPay, Qpay) are included **only** where they share one of the four covered tech stacks (Section 1.4); a third customer, or a distinct tech stack, is a further Change Order.

**Additional time:** _[proposed]_ ___ business days (≈ 3–5 weeks for the service + first adapter; each further partner adapter ~1–2 weeks)
**Additional fee (one-time):** USD _[proposed]_ ________ (service + first adapter) · **+USD _[proposed]_ per additional partner adapter**

**Accepted?** ☐ Yes ☐ No — Client initials: ____

---

## PART B — Scope Reconciliation (no additional fee)

This Part amends contracted behavior to match the agreed v2 design. It carries **no charge**; it exists so the delivered Platform lawfully matches the Agreement.

**B.1 Customer tier logic (amends Section 1.3).** The Parties agree that customer tiers are **assigned and adjusted by the Client's administrators**, replacing the automatic cumulative-volume upgrade described in Section 1.3. The tier structure is updated to:

| Tier | Label | Units |
|---|---|---|
| Tier 1 | Consumer | 1–9 |
| Tier 2 | Retailer | 10–49 |
| Tier 3 | Wholesale | 50–399 |
| Tier 4 | Distributor | 400+ |

(Replaces the Section 1.3 labels "Multi-Store"/"Wholesale" for Tiers 3–4 and the 400/401 boundary.)

**Accepted?** ☐ Yes ☐ No — Client initials: ____

---

## PART C — Contingent Items (pre-agreed triggers; become CO-02 only if triggered)

These are **not** charged now. They are recorded so both Parties know in advance what will require a further Change Order, avoiding surprise mid-project.

- **C.1 — Customer integration on a distinct tech stack (Section 1.4).** SmartPay and Qpay are included **only if** each uses the same underlying tech stack as one of the four (4) covered supplier API tech stacks. If either requires a distinct stack, that integration becomes a Change Order. _Estimate to be provided upon receipt of the customer's API specification._
- **C.2 — Fifth supplier/customer tech stack (Section 1.4, Schedule A.1).** A fifth distinct API tech stack beyond the four covered is a Change Order.
- **C.3 — Live carrier rate / landed-cost calculation.** Shipment **tracking** is in scope (Section 1.8); live FedEx/UPS rate shopping and landed-cost computation are not, and would be scoped separately.

---

## PART D — Effect on Timeline

The delivery timeline in Section 3.1 is extended by the sum of the accepted Part A items' additional time, applied day-for-day per Section 3.3.

- Base timeline: 120 days from the Effective Date.
- Accepted additional time (sum of A.1 / A.2 / A.3 / A.4 as checked): ____ business days.
- **Revised estimated Final Delivery:** ________________.

---

## PART E — Effect on Fees

| | Amount (USD) |
|---|---|
| Original Development Fee (Agreement §2.1) | 12,000.00 |
| Item A.1 — AI Agent Swarm _(if accepted)_ | _[proposed]_ __________ |
| Item A.2 — Pricing Engine v2 _(if accepted)_ | _[proposed]_ __________ |
| Item A.3 — Partner Inventory API Platform _(if accepted)_ | _[proposed]_ __________ |
| Item A.4 — Partner order-intake (adapt to their API) _(if accepted)_ | _[proposed]_ __________ |
| **Revised total one-time fee** | __________ |

**Billing of the added fee:** ☐ added pro-rata across the remaining installments (§2.2) · ☐ invoiced as a separate milestone on execution of CO-01 · ☐ other: __________.

Recurring third-party costs introduced by accepted items (A.2 market-data feeds; A.1 model usage) are governed by Section 2.3 and, where applicable, Section 2.7.

---

## PART F — General

1. This CO-01 is governed by, and forms part of, the Agreement (Section 8). In case of conflict between this CO-01 and the Agreement as to the items addressed herein, this CO-01 controls.
2. All other terms, including intellectual property (§5), confidentiality (§6), warranty and liability (§7), and governing law (§10.7), remain unchanged and apply to the added deliverables.
3. This CO-01 may be executed in counterparts and via electronic signature per Section 10.9.

**IN WITNESS WHEREOF,** the Parties execute this Change Order No. 01 as of the date first written above.

**DEVELOPER**

_______________________________
Denis Feitoza — VINDIAI (CNPJ 39.243.933/0001-45)
Date: ____ / ____ / ______

**CLIENT**

_______________________________
Abdu Abdelrahman — President, Order My Phones LLC
Date: ____ / ____ / ______

---

### Developer's internal pricing note (remove before sending to Client)

Basis for the _[proposed]_ figures — relative to the USD 12,000 base that covers the whole core platform:

| Item | Relative effort (from the module WBS) | Suggested one-time range | Suggested time |
|---|---|---|---|
| A.1 AI Agent Swarm | XL — orchestrator + 4 agents + guardrails + evals | set from your day-rate × ~20–30 dev-days | ~4–6 weeks |
| A.2 Pricing Engine v2 | XL — engine + **per-source scraping bots** (login/proxy/anti-bot on a dedicated machine) + flag-queue UI + tests | ~35–45 dev-days | ~7–9 weeks |
| A.3 Partner API platform (delta) | L — beyond the 2 named integrations | ~15–20 dev-days | ~3–4 weeks |
| A.4 Partner order-intake (adapt to their API) | XL — per-partner adapters; **scales per partner** | ~15–25 dev-days (service + 1st adapter) | ~3–5 weeks |

These are effort anchors, **not** prices — set the dollar amounts from your own rate and margin before sending. Note A.2's competitive pricing is **build-your-own bots + scraping** (high complexity + recurring maintenance), not a simple API; confirm any market-data subscription with a live quote. A.4 **scales per partner** (each additional customer order API = its own adapter). Do not send the placeholders unfilled.
