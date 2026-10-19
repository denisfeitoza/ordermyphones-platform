# ADR — v1.0 Locked Decisions (client-approved)

> Transcription of the decisions locked with the client through 2026-08-06
> (source of record: docs/planning/OMP-V1-Execution-Plan.html + chat approvals).
> These are LOCKED — plans must not re-open them.

## Product scope — v1.0 (manual release)

1. **Pricing follows the Pricing Engine v2 document.** T1 = trimmed-mean market
   benchmark (assisted via comps spreadsheet/manual until APIs in v1.1);
   T2 = T1 − $20; T3/T4 = cost-plus bands computed at import. Floors, grade
   gate (NEW/CPO/A for T1/T2), flags, tier-order invariant, 15% cost-swing
   hold — all per the document. No invented pricing.
2. **Accounts are invite-only; the admin picks the tier in the invite.**
   No open signup. Signup form fields per tier: see REGISTRATION-FIELDS.md
   (three-gate model G0/G1/G2 — signup itself is name + password only).
3. **QPay is a regular customer** (wholesale tier). No special Excel intake,
   no integration. SmartPay module dissolved.
4. **Zero external APIs in v1.0.** No e-mail bots, no supplier adapters, no
   comps APIs, no Stripe. Stock in/out via spreadsheet; billing off-system.
5. **Stock deducts on APPROVAL, not on order.** Orders hold nothing; approval
   validates against the live balance and deducts (transaction); shortfalls
   are approved partially and land in a reconciliation queue.
6. **Customers see EXACT quantities, with per-location breakdown** (stock
   location display names, e.g. Texas / Tennessee).
7. **No minimum quantity / multiples enforcement in the cart** by default.
   Rules exist as admin-panel configuration (off / warn / block), shipped OFF.
8. **Shipping stays outside the system** in v1 (arranged directly).
9. **The existing mockup is the base**: same codebase and URL evolve into the
   real product (Vercel deploy for v1; VPS/Docker docs are historical).
10. **FULL admin configuration panel**: tiers (names/ranges/bands), quantity
    rules, pricing parameters, stock locations, grade maps, users & invites,
    catalog display options — all admin-editable, no code changes.
11. **UI default language is English**; PT/ES via the discreet header switcher.
    Currency USD.
12. **Tier naming (settled):** Consumer (1–9) / Retailer (10–49) /
    Wholesale (50–399) / Distributor (400+).

## Platform & environment

- **Supabase project `rdkkbiyugcjyrnkvobrr`** ("Ordermyphone", us-east-1,
  Postgres 17) is clean (0 tables) and is THE v1 backend.
- **Existing SQL drafts `supabase/migrations/0001–0009` are OUTDATED** —
  written before the roles/locations/import-profile decisions. They must be
  redesigned from scratch; never applied as-is.
- **Role model from migration 1:** `admin / staff / customer` + `is_test`,
  RLS on every table, role-based sign-in routing. The `/enter/:where` mockup
  backdoor and checkout auto-login must NOT survive into v1.
- **Supplier confidentiality:** real supplier names (Source A, Source B)
  are server-side only (admin-gated via RLS); customer-facing surfaces and
  the client bundle use anonymized labels (Source A/B, location names).
- **Admin lenses:** tier preview (shipped in mockup) is re-implemented
  server-side in v1; "view as customer" read-only lens with audit.

## Explicitly OUT of v1.0 (do not plan)

Price bots / competitive scraping · supplier adapters & e-mail bot ·
Partner Inventory API (outbound) · partner order-intake adapters · partner
management · Stripe payments · AI orchestrator/agent swarm · SmartPay
(dissolved) · realtime pricing edge function (import-time pricing suffices).

## Delivery shape

Four weekly stages, each closing with something demonstrable:
S1 foundation (schema+RLS+auth+roles, HYLA import proving real stock — Friday
live demo) · S2 catalog + automatic T3/T4 pricing + export ·
S3 invites + customer ordering + approval/reconciliation ·
S4 full admin config panel + observability + QA + first real invites.

## RFC-001 — payments, shipping, onboarding, auctions (2026-10-19)

Client answers to RFC-001 and what is built from them. Items marked
*assumption* wait for OMP confirmation.

- **D1 Payments:** no card gateway before Nov 15. Wire/ACH only. Staff mark
  an order paid (reference + date). Gateway choice (Fiserv or other) is open.
- **D2 Terms per customer:** COD, Cash on Order (ACH/Wire), Net 7/10/15/30,
  optional credit limit. Approval warns on missing or exceeded credit (soft
  gate with override). A Cash-on-Order order cannot ship unpaid.
- **D3 Shipping:** OMP ships and bills shipping by default; the customer can
  give a carrier account; or the customer sends a label after OMP packs
  (not for retailers). Label upload goes to a private bucket.
- **D4 Auctions:** bids are binding (raise only, never withdrawn). New
  accounts need a $2,500 deposit, toggled per account by staff. Portal closes
  20 min before the supplier deadline. *Assumptions:* sealed bids, per-unit
  price unless the event says per lot, ties go to the earliest bid, a won lot
  does not create an order automatically.
- **Q3 Sales Order:** PDF + QuickBooks CSV export ship now with a draft
  layout; OMP's QuickBooks template will replace the column mapping.
- **Onboarding:** business profile (CX Reg, provisional fields), document
  slots (resale certificate satisfies the tax gate), Master Agreement with
  versioned, hashed text and append-only signatures. The agreement gate only
  applies once a version is published.
- **E-mail:** every business event queues a row in `email_outbox` with
  EN/PT/ES templates. Nothing is sent until an SMTP sender is connected.
- **Tiers by volume:** lifetime approved units suggest a tier (*assumption:*
  retailer 10, wholesale 50, distributor 401 units). Staff change tiers by
  hand; nothing upgrades on its own.
- **Still integration work (not built):** SMTP sender, mailbox ingestion,
  Verizon zip/e-mail parser, B-Stock/Rexi automation, auction award → order,
  FedEx production labels/rates, payment gateway.
