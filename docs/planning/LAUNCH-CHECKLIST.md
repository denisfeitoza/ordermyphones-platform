# First-Signups Launch Checklist (living doc)

> The gate to invite real people. Derived from
> [`TEST-READY-V1.md` §5](TEST-READY-V1.md) plus the Phase 8 launch-readiness
> items. Update the status column as items close. Status legend:
> **DONE** (verified) · **PENDING** (owner action, not blocked) ·
> **BLOCKED** (waiting on access/data outside the repo).
>
> Last updated: 2026-08-07 (Phase 8 build).

## 1. TEST-READY §5 gate items

| # | Item | Status | Evidence / what verifies it |
|---|---|---|---|
| G-1 | Invite e-mail delivers (native sender) + link expires sanely | **BLOCKED** | Invites work end-to-end via a copyable link today; `create_invite`/`get_invite`/`redeem_invite` verified live (Phase 5). Transactional e-mail delivery is deferred behind `app_settings.invite_email_delivery=false` — flip once a sender/service-role is wired. Link expiry is enforced in `redeem_invite`. |
| G-2 | G0 signup < 1 minute (name + password only) | **DONE** | Invite-accept page collects name + password only (REGISTRATION-FIELDS.md G0); `redeem_invite` creates a real login-capable auth user + applies the invited tier in one transaction. Verified live/rolled-back (Phase 5). |
| G-3 | Role routing correct (customer never sees admin) | **DONE** | `profiles.role` + RLS on every table; role-routed sign-in + `RequireAuth` gates (Phase 1, verified across all 6 seeded accounts). |
| G-4 | Tier prices correct per lens | **DONE** | `variant_price_for_me` server-side per-tier resolution (cost never reaches the client); admin tier lens + Phase 3 verification (cost $300 → T1 $400 / T2 $380 / T3 $312 / T4 $305, invariant holds). |
| G-5 | Order → approval → deduct → reconciliation loop closes | **DONE** | `place_order`/`approve_order`/`reject_order`/`resolve_reconciliation`; verified live (order 8 → approve → price captured $160 T3, inventory 5→0, partial + reconciliation shortfall 3) (Phase 6). |
| G-6 | Audit ledger records every movement | **DONE** | Append-only `stock_movements` (owner/service_role-proof trigger) is the source of truth; `admin_audit` for sensitive admin/lens actions; `audit_log` for order decisions. |
| G-7 | Password reset works end-to-end | **BLOCKED** | Request + PKCE recovery callback implemented and verified at the code/SDK level (commits 1676473 / 312c7d2). Real-inbox click-through E2E is **blocked on an inbox I can't reach** — recommend Denis run one live reset before inviting real users. |
| G-8 | `/ops` public page — keep only if anonymized, else retire | **PENDING** | `/ops` is served anonymized (supplier names masked to Source A/B; the Phase-1 gate confirmed the customer-reachable bundle + `/proposal.html` + `/ops` are clean of real supplier names). Denis to make the final keep/retire call before launch. |

## 2. Phase 8 launch-readiness items

| # | Item | Status | Evidence |
|---|---|---|---|
| L-1 | Observability wired behind optional env (no keys needed now) | **DONE** | Sentry + PostHog init ONLY when `VITE_SENTRY_DSN` / `VITE_POSTHOG_KEY` are set (no-op otherwise). Sentry `beforeSend` PII-scrub + Sentry/PostHog identify by UUID, reset on sign-out. Unit-tested (`lib/sentry.test.ts`). Keys are deferred config (add to host env when ready). |
| L-2 | Test-data reset (real data untouchable) | **DONE (apply pending)** | `reset_test_data()` authored in `20260807220000_test_hygiene.sql`: zero-param, admin-only; sole predicate `orders.is_test=true`; compensating movements restore inventory (append-only ledger); never touches `profiles`. Orchestrator applies via MCP. Recommend a live set-scenario → call → readback before relying on it. |
| L-3 | Reports exclude `is_test` rows by default | **DONE (read side follow-up)** | `app_settings.reports_include_test=false` + `orders_reportable` (security_invoker) view authored. The admin ReportsPage is still MOCK, so the read side lands when reports move off mock (same posture as Phase 7 items 4/5/6). |
| L-4 | TEST environment badge + export watermark | **DONE (customer path)** | Discreet corner chip when the account is `is_test` or `VITE_ENV` is a non-prod value; a `TEST` pill on the order detail; TEST watermark + "not for fulfillment" note on PDF/CSV export of `is_test` orders. **Note:** the watermark covers the CUSTOMER order export (the only export surface that exists). There is no admin/staff picking sheet yet — when one is built it must consume the same `ExportDoc.isTest` watermark so a rehearsal order can't be picked. |
| L-5 | Classify carried-forward grade `TPS A-` | **DONE** | `vendor_grade_map` gets `HYLA / 'TPS A-' → CTIA A` (default, admin-editable in the Phase-7 Grades tab). Closes gate item LNCH-02. |
| L-6 | Trilingual (EN/PT/ES) on customer surfaces | **DONE (partial)** | Phase 4-6 real surfaces were already fully `t()`-covered; the two missing keys (`Menu`, `Back to orders`) added; PT/ES at exact key-set parity; `dict.test.ts` guards it. **PENDING:** mock-era `ContactPage`/`HelpPage` + several mock portal pages remain largely untranslated (out of Phase 4-6 scope — a larger deliberate i18n pass). |
| L-7 | Light WCAG 2.1 AA pass on customer surfaces | **DONE (light)** | Hardcoded aria-labels on the live cart/header flow now translate; OrderCard progress labels dropped the sub-AA `muted/50` opacity. Sweep found no missing `<img>` alt, no unlabeled icon buttons, no div-click handlers, inputs label-associated. **PENDING (larger):** full Contact/Help translation-of-aria, tiny-text (`text-[0.65rem]`) audit on mock pages, a formal AA contrast run. |

## 3. Blocked-on-access items (need Denis / environment)

- **Real HYLA import E2E** — the 2,675-row `.xls` lives in `~/Downloads`, which is
  TCC-blocked in this environment. The import pipeline + `commit_stock_import`
  are DB-verified with synthetic data; the real-file run + the storefront flip to
  `catalog_source='real'` happen once the file is reachable.
- **Real-inbox password-reset E2E** (G-7) — needs a live inbox.
- **Rotate the 6 `@test` account passwords + the Supabase PAT** before inviting
  real customers (standing Phase 8 obligation from AUTONOMOUS-DECISIONS).
- **Git history still contains old real supplier names** (working tree is clean;
  a history purge needs a force-push Denis must approve).

## 4. Pre-invite runbook (once the blockers clear)

1. Apply migration `20260807220000_test_hygiene.sql` (orchestrator/MCP).
2. Run the real HYLA import; verify the catalog + tier prices; flip
   `app_settings.catalog_source` to `'real'`.
3. Place + approve a couple of `@test` orders; confirm the TEST badge + export
   watermark; run `reset_test_data()` and confirm inventory is restored and no
   real rows moved.
4. Do one live password-reset (G-7) and one invite-accept (G-2) end to end.
5. Rotate `@test` passwords + the Supabase PAT (§3).
6. (Optional) add `VITE_SENTRY_DSN` / `VITE_POSTHOG_KEY` to the host env for
   first-signup observability, and set `VITE_ENV=production`.
7. Send the first real invites.
