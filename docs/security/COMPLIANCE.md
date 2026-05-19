# Compliance Posture

> Compliance is a moving target. This document captures the posture at delivery and the operating regimes that the engagement enforces. Specific certifications (SOC 2, ISO 27001) are out of scope for the Development Fee; the architecture supports adding them under the maintenance addendum (Agreement §2.3).

## 1. Jurisdiction & governing law

- The Agreement is governed by the laws of the **State of Delaware, USA** (§10.7).
- The Client is incorporated in Delaware; the Developer is incorporated in Brazil.
- The Platform serves U.S. customers at launch; international expansion is anticipated (Agreement §1.1) but not delivered at launch (Schedule A.3).

## 2. Standards we operate against

| Area | Standard | How we apply it |
|---|---|---|
| Payments | PCI-DSS SAQ-A | We use Stripe Checkout and Elements; the Platform never sees raw card data. |
| Personal data (US) | CCPA / CPRA principles | Honored by data classification + erasure flow ([`DATA-CLASSIFICATION.md` §5](DATA-CLASSIFICATION.md)). |
| Personal data (EU/UK) | GDPR principles | Erasure + portability flows aligned; no EU rollout at launch (Schedule A.3). |
| Personal data (Brazil) | LGPD principles | Same posture as GDPR; relevant to the Developer's own records. |
| Web accessibility | WCAG 2.1 AA on customer-facing surfaces | Audited in Phase 3 ([`../ux/A11Y-AUDIT.md`](../ux/A11Y-AUDIT.md)). |
| Application security | OWASP Top 10 | Verified in the Phase 4 security pass ([`../phases/PHASE-4-QA-AND-DEPLOYMENT.md` §2.3](../phases/PHASE-4-QA-AND-DEPLOYMENT.md)). |

## 3. PCI posture

- Stripe Checkout / Elements keep us in **SAQ-A** scope.
- The Platform stores only Stripe payment-method references (`pm_*`), payment-intent IDs (`pi_*`), and event payloads (`raw_event` in `payments`).
- No raw PAN, no CVV, no full magnetic data crosses the Platform.
- Stripe webhook signature verification is mandatory and tested.

## 4. Privacy posture

- Privacy policy + terms-of-service surfaces are part of the storefront (delivered in Phase 3). The Client provides the legal text; the Developer wires the UX.
- Cookies & tracking: PostHog respects user opt-out signals.
- AI prompt logs that touch confidential data are PII-scrubbed before archival ([`DATA-CLASSIFICATION.md` §4](DATA-CLASSIFICATION.md)).
- A redaction layer in [`services/ai-api/`](../../services/ai-api/) strips PII keys from prompt context.

## 5. Vendor inventory

| Vendor | Purpose | Data shared | DPA / SCC required |
|---|---|---|---|
| Supabase | DB + Auth + Storage + Realtime + Edge | Identifiers, PII (via accounts table), AI proposals | DPA signed by the Client |
| Stripe | Payments | Customer email, addresses, payment instruments | DPA signed by the Client |
| Supplier API #1 (US) | Catalog + dropship | Order shipping data | NDA + DPA per Agreement §4 |
| Supplier API #2 (US + DXB) | Catalog + dropship + wholesale | Order shipping data + commercial terms | NDA + DPA per Agreement §4 |
| OpenRouter / Anthropic | AI inference | Prompt context (PII-redacted) | DPA per provider |
| Sentry | Error tracking | Opaque correlation IDs (no PII) | DPA per provider |
| PostHog | Product analytics | Account UUIDs (no PII) | DPA per provider |

Vendor list is reviewed quarterly under the §2.3 maintenance addendum.

## 6. Roles & responsibilities

| Activity | Owner |
|---|---|
| DPAs and SCC paperwork | Client |
| Stripe Connect account, KYC | Client |
| Production domain + DNS | Client |
| Production credentials custody | Client (Developer holds operational access by delegation) |
| Compliance reviews quarterly | Joint, scheduled in the maintenance addendum |
| Security incident response | Developer leads investigation; Client owns external communication |

## 7. What is **not** in this engagement

- Formal SOC 2 / ISO 27001 audit and certification.
- HIPAA, FedRAMP, or any regulated-industry certification.
- Multi-region data residency.
- Custom legal review of supplier contracts.

These are negotiable additions handled via Change Order or under the §2.3 maintenance addendum.

## 8. References

- [`THREAT-MODEL.md`](THREAT-MODEL.md)
- [`DATA-CLASSIFICATION.md`](DATA-CLASSIFICATION.md)
- [`../architecture/AUTH-AND-RLS.md`](../architecture/AUTH-AND-RLS.md)
- [`../ai/EVAL-AND-GUARDRAILS.md`](../ai/EVAL-AND-GUARDRAILS.md)
