# Phase 3 — Frontend, Customer Portal & Admin Dashboard

**Window:** Weeks 9–13 (≈ Day 57 – Day 91 of the Effective Date)
**Maps to Agreement:** §1.5, §1.6, §1.7, §1.8 (modules 3, 6, 7), §3.2 (Phase 3), Schedule A.

---

## 1. Goal

Deliver every customer- and operator-facing surface of the Platform. By end of Phase 3, a real customer can browse, buy, track, and self-manage; a real operator can run the day-to-day business.

Mobile-first is non-negotiable (per the developer standard §3.4): every screen designed and verified at 320–428px before desktop refinements.

---

## 2. Scope (in scope)

### 2.1 Storefront

- **Branded landing page** built from the Phase 1 hi-fi: hero with tier-aware messaging, featured collections, social proof, value proposition for B2B buyers.
- **Catalog** with filters (brand, model, color, storage, condition/grade, price range, in-stock toggle), smart search, sort, paginated with proper URL state.
- **Product detail** with:
  - 3D viewer slot (gracefully degrades when no 3D asset present).
  - Variant matrix (model × storage × color × condition/grade).
  - Live stock indicator (cross-supplier, debounced).
  - "Your tier price" overlay when authenticated; "Sign in for tier pricing" prompt when not.
- **Cart** with line-level pricing, real-time tier recompute (a cart at 49 units shows tier-2 prices; bump to 50 and tier-3 pricing applies live).
- **Checkout**: address, shipping selection, Stripe Payment Element, terms acceptance, order confirmation.
- **Account creation / sign-in** with magic link and email+password; recovery flow.

### 2.2 Customer portal

Per Agreement §1.7, an authenticated portal with:

- **Orders** — list, detail, real-time status with carrier tracking when available.
- **Tier dashboard** — current tier, progress bar to next tier (units remaining), historical promotion timeline.
- **Addresses** — CRUD with default-shipping/default-billing flags.
- **Payment methods** — manage Stripe-stored payment methods (delegated to Stripe Elements).
- **Account settings** — profile, email, password change, notification preferences.
- **Quick reorder** — one-tap reorder of a past order, with current pricing applied.

### 2.3 Admin dashboard

Per Agreement §1.6:

- **Customer management** — list, detail (purchases, tier, addresses, payment methods, notes), manual tier override with reason.
- **Order processing** — list with filters, detail, status transitions (paid → fulfilling → shipped), refund flow, internal notes.
- **Inventory control** — owned-stock CRUD + supplier sync visibility (last successful sync per supplier, last error, row counts).
- **Price configuration** — global tier rules, per-product overrides, per-variant overrides; preview the effective price for a hypothetical customer × cart.
- **API logs** — supplier sync runs, Stripe webhook deliveries, AI agent actions with rollback links.
- **Reporting** — sales over time, top SKUs, supplier mix, tier distribution, conversion by tier.

### 2.4 AI surfaces inside the admin

The AI swarm built in Phase 2 surfaces in the dashboard as **explicit, opt-in actions**:

- "Suggest a quote for this customer" → pricing-agent.
- "Triage low-stock SKUs" → inventory-triage-agent.
- "Draft a reply to ticket #X" → customer-support-agent (admin reviews and sends).
- "Recommend a manual tier override for customer Y" → tier-classifier-agent.

Every AI-suggested action shows the rationale, the proposed change, and an explicit Approve/Reject control. No silent state changes.

### 2.5 Design system enforcement

- Tailwind tokens from Phase 1 design system applied via [`apps/web/tailwind.config.ts`](../../apps/web/tailwind.config.ts).
- Shadcn/UI components added through the shadcn MCP, not copy-pasted by hand.
- Accessibility baseline: WCAG 2.1 AA on all customer-facing screens; keyboard navigation; visible focus states; semantic HTML.
- Motion: respects `prefers-reduced-motion`.

### 2.6 PostHog product analytics

- Event taxonomy from Phase 2 implemented in the storefront and portal.
- Identification ties anonymous → authenticated sessions on sign-in.
- Dashboards prepared for the four-phase exit review.

---

## 3. Out of scope (this phase)

- Native mobile apps (out of scope per Schedule A.3).
- A non-English / non-USD experience (out of scope per Schedule A.3).
- AI features beyond admin-supervised actions (autonomous customer-facing AI is post-delivery scope).

---

## 4. Entry criteria

- Phase 2 deliverables accepted (backend stable, supplier sync running, Stripe sandbox green, AI v1 callable).
- Hi-fi designs from Phase 1 still represent the agreed scope; any drift handled via Change Order.

---

## 5. Deliverables

| Deliverable | Location |
|---|---|
| Production-ready storefront | [`apps/web/`](../../apps/web/) — routes: `/`, `/catalog`, `/p/:slug`, `/cart`, `/checkout`, `/auth/*` |
| Customer portal | [`apps/web/src/routes/portal/*`](../../apps/web/src/routes/) |
| Admin dashboard | [`apps/web/src/routes/admin/*`](../../apps/web/src/routes/) |
| Shadcn component library customizations | `apps/web/src/components/ui/` |
| State & data layer (TanStack Query) | `apps/web/src/lib/queryClient.ts`, `apps/web/src/hooks/` |
| Stripe Elements integration | `apps/web/src/lib/stripe.ts` + checkout route |
| PostHog instrumentation | `apps/web/src/lib/analytics.ts` |
| Accessibility test report | `docs/ux/A11Y-AUDIT.md` |
| Visual QA report (mobile + desktop screenshots per route) | `docs/ux/VISUAL-QA.md` |

---

## 6. Exit criteria

- All routes render and pass `npm run build` and `npm run typecheck` without warnings.
- Storefront and portal pass the accessibility baseline on the audited routes.
- Mobile-first parity: every screen verified at 320px, 375px, 414px, 768px, 1024px, 1440px.
- End-to-end smoke: a fresh user can register, browse, add to cart, checkout (Stripe test card), see the order in the portal, and an admin can move it through the order lifecycle.
- AI-action surfaces in the admin are wired to the v1 agents and the audit log shows the proposed-vs-applied diff.

---

## 7. Workstreams & sequencing

```
W1 (Design system + shell)   ──[tokens]──[layout]──[auth shell]──┐
W2 (Storefront)              ───[landing]──[catalog]──[product]──┤
W3 (Cart + checkout)         ────────[cart]──[stripe checkout]───┼─> Phase 3 review
W4 (Customer portal)         ──────────[orders]──[tier]──[acct]──┤
W5 (Admin dashboard)         ─────[customers]──[orders]──[invty]─┤
W6 (AI surfaces in admin)    ───────────────────────[ai panels]──┘
```

W1 unblocks everything else (week 9). W2 + W3 finish before W4 (portal reuses storefront primitives). W5 runs in parallel after the design system stabilizes. W6 is last because it depends on the admin UX being settled.

---

## 8. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Mobile-only visual bugs found late | High | Medium | Mobile-first per §3.4; visual QA at every weekly review on 4 viewport sizes. |
| Live tier recompute causes price-flicker UX on cart edits | Medium | Medium | Debounce + optimistic UI; explicit "pricing updating…" affordance; integration tests on the boundary cases. |
| Stripe Elements integration drifts between sandbox and production accounts | Low | High | Sandbox-to-production checklist in [`docs/integrations/STRIPE.md`](../integrations/STRIPE.md); env-driven config; production smoke on Day 1 of Phase 4. |
| AI surfaces invite operator confusion ("did the AI do this or did I?") | Medium | Medium | Every AI suggestion labeled with the agent name, timestamp, and an explicit Approve/Reject control; audit log links from every record. |
| 3D viewer asset availability lower than expected | Medium | Low | Graceful fallback to high-quality 2D imagery; the product detail respects asset presence per Agreement §1.5. |

---

## 9. Client interaction points

- **Start of Phase 3 — Kickoff (45 min).** Confirm priorities for the admin dashboard MVP.
- **Week 10 — Storefront demo (60 min).** Landing + catalog + product on staging.
- **Week 11 — Checkout demo (60 min).** Cart + Stripe checkout flow; refund path.
- **Week 12 — Portal & admin demo (60 min).** Customer portal + admin core flows.
- **Week 13 — AI demo (45 min).** AI surfaces in admin, audit log walkthrough.
- **End of Phase 3 — Phase review (90 min).** Acceptance & sign-off for Phase 4.

---

## 10. Artifacts produced in the repository

- `apps/web/src/routes/*`
- `apps/web/src/components/*`
- `apps/web/src/lib/{supabase,stripe,analytics,queryClient}.ts`
- `apps/web/tailwind.config.ts` (final)
- `docs/ux/A11Y-AUDIT.md`
- `docs/ux/VISUAL-QA.md`
- `docs/ux/CUSTOMER-PORTAL.md` (final)
- `docs/ux/ADMIN-DASHBOARD.md` (final)
