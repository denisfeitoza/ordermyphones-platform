# First-Signups Launch Checklist (living doc)

> The gate to invite real people. Derived from
> [`TEST-READY-V1.md` §5](TEST-READY-V1.md) plus the Phase 8 launch-readiness
> items. Update the status column as items close. Status legend:
> **DONE** (verified) · **PENDING** (owner action, not blocked) ·
> **BLOCKED** (waiting on access/data outside the repo).
>
> Last updated: 2026-09-13 (post sub-accounts; gate re-run; audit fixes —
> see [AUDIT-2026-09-13.md](AUDIT-2026-09-13.md) §Status).

## 1. TEST-READY §5 gate items

| # | Item | Status | Evidence / what verifies it |
|---|---|---|---|
| G-1 | Invite e-mail delivers (native sender) + link expires sanely | **BLOCKED** | Invites work end-to-end via a copyable link today; `create_invite`/`get_invite`/`redeem_invite` verified live (Phase 5). Transactional e-mail delivery is deferred behind `app_settings.invite_email_delivery=false` — flip once a sender/service-role is wired. Link expiry is enforced in `redeem_invite`. |
| G-2 | G0 signup < 1 minute (name + password only) | **DONE** | Invite-accept page collects name + password only (REGISTRATION-FIELDS.md G0); `redeem_invite` creates a real login-capable auth user + applies the invited tier in one transaction. Verified live/rolled-back (Phase 5). |
| G-3 | Role routing correct (customer never sees admin) | **DONE** | `profiles.role` + RLS on every table; role-routed sign-in + `RequireAuth` gates (Phase 1, verified across all 6 seeded accounts). |
| G-4 | Tier prices correct per lens | **DONE** | `variant_price_for_me` server-side per-tier resolution (cost never reaches the client); admin tier lens + Phase 3 verification (cost $300 → T1 $400 / T2 $380 / T3 $312 / T4 $305, invariant holds). |
| G-5 | Order → approval → deduct → reconciliation loop closes | **DONE** | `place_order`/`approve_order`/`reject_order`/`resolve_reconciliation`; verified live (order 8 → approve → price captured $160 T3, inventory 5→0, partial + reconciliation shortfall 3) (Phase 6). |
| G-6 | Audit ledger records every movement | **DONE** | Append-only `stock_movements` (owner/service_role-proof trigger) is the source of truth; `admin_audit` for sensitive admin/lens actions; `audit_log` for order decisions. |
| G-7 | Password reset works end-to-end | **DONE (delivery) · PENDING (final click)** | 2026-09-13: requested a reset from the production site for a real Gmail inbox — the branded "Reset your OrderMyPhones password" e-mail landed in the inbox within seconds, twice, with a correct `verify?type=recovery&redirect_to=…/auth/callback` link. The callback route renders and reports an invalid link cleanly when the PKCE verifier is missing (a link requested on localhost and opened on production — expected). The final click on the e-mailed link is Denis's: open the newest e-mail on the same browser you requested it from and set a password on the `Reset E2E (test)` account. **Finding:** a third request within the hour came back `429` (the form shows the "Too many requests" notice correctly) — Supabase's built-in mailer allows ~2 auth e-mails per hour and only to project-member addresses. Real customers need custom SMTP (Resend/Postmark/SES) in Supabase → Auth → SMTP before launch; same prerequisite as G-1. |
| G-8 | `/ops` public page — keep only if anonymized, else retire | **DONE** | `/ops` is no longer public: the route sits behind `RequireAuth roles=['admin','staff']` (App.tsx) and its content is anonymized (Source A/B). Nothing left to decide. |

## 2. Phase 8 launch-readiness items

| # | Item | Status | Evidence |
|---|---|---|---|
| L-1 | Observability wired behind optional env (no keys needed now) | **DONE** | Sentry + PostHog init ONLY when `VITE_SENTRY_DSN` / `VITE_POSTHOG_KEY` are set (no-op otherwise). Sentry `beforeSend` PII-scrub + Sentry/PostHog identify by UUID, reset on sign-out. Unit-tested (`lib/sentry.test.ts`). Keys are deferred config (add to host env when ready). |
| L-2 | Test-data reset (real data untouchable) | **DONE (apply pending)** | `reset_test_data()` authored in `20260807220000_test_hygiene.sql`: zero-param, admin-only; sole predicate `orders.is_test=true`; compensating movements restore inventory (append-only ledger); never touches `profiles`. Orchestrator applies via MCP. Recommend a live set-scenario → call → readback before relying on it. |
| L-3 | Reports exclude `is_test` rows by default | **DONE** | `app_settings.reports_include_test=false` (default). The admin ReportsPage runs on the live order book in real mode and, since 2026-09-13, drops `orders.is_test` rows unless the setting is on; an admin-only "Include test orders" switch on the page flips the setting and shows how many rehearsal orders are hidden. Sub-accounts now inherit the owner's `is_test` (migration `20260913100000`), so a rehearsal owner's team can't leak real-looking orders. |
| L-4 | TEST environment badge + export watermark | **DONE (customer path)** | Discreet corner chip when the account is `is_test` or `VITE_ENV` is a non-prod value; a `TEST` pill on the order detail; TEST watermark + "not for fulfillment" note on PDF/CSV export of `is_test` orders. **Note:** the watermark covers the CUSTOMER order export (the only export surface that exists). There is no admin/staff picking sheet yet — when one is built it must consume the same `ExportDoc.isTest` watermark so a rehearsal order can't be picked. |
| L-5 | Classify carried-forward grade `TPS A-` | **DONE** | `vendor_grade_map` gets `HYLA / 'TPS A-' → CTIA A` (default, admin-editable in the Phase-7 Grades tab). Closes gate item LNCH-02. |
| L-6 | Trilingual (EN/PT/ES) on customer surfaces | **DONE (partial)** | Phase 4-6 real surfaces were already fully `t()`-covered; the two missing keys (`Menu`, `Back to orders`) added; PT/ES at exact key-set parity; `dict.test.ts` guards it. **PENDING:** mock-era `ContactPage`/`HelpPage` + several mock portal pages remain largely untranslated (out of Phase 4-6 scope — a larger deliberate i18n pass). |
| L-7 | Light WCAG 2.1 AA pass on customer surfaces | **DONE (light)** | Hardcoded aria-labels on the live cart/header flow now translate; OrderCard progress labels dropped the sub-AA `muted/50` opacity. Sweep found no missing `<img>` alt, no unlabeled icon buttons, no div-click handlers, inputs label-associated. **PENDING (larger):** full Contact/Help translation-of-aria, tiny-text (`text-[0.65rem]`) audit on mock pages, a formal AA contrast run. |

## 3. Blocked-on-access items (need Denis / environment)

- ~~Real HYLA import E2E~~ — **DONE 2026-08-07** (2,675 rows imported) and
  `catalog_source` has been `'real'` in production since then.
- ~~Real-inbox password-reset E2E~~ (G-7) — delivery **DONE 2026-09-13**; the
  final link click is Denis's (see G-7).
- ~~Rotate the `@test` account passwords~~ — **DONE 2026-09-13**: all 10
  `is_test` logins (the 5 original `@test` accounts + the 5 sub-account fixtures)
  got fresh random passwords; they live only in the gitignored
  `scripts/.test-accounts.local` on Denis's machine. `TestPass123!` and the
  seed password no longer work anywhere.
- **Rotate the Supabase PAT** — still Denis's: Supabase Dashboard → Account →
  Access Tokens. Not doable from inside the repo, and rotating it also
  re-authorizes the Supabase MCP connector.
- **Invite e-mail delivery (G-1)** and **Sentry/PostHog keys (L-1)** — need
  credentials that don't exist yet (a transactional sender; the two
  observability projects). Everything is wired and env-gated; adding the keys
  is the whole job.
- **Git history still contains old real supplier names** (working tree is clean;
  a history purge needs a force-push Denis must approve — see §5).

## 5. Git-history purge (needs an explicit go)

Two real supplier names appear in 28–29 historical commits (all pre-anonymization).
The working tree is clean except this planning log. Purging means rewriting
`main` and force-pushing: every clone must be re-cloned afterwards, and
`git filter-repo` (Python) is not installed on the Windows box. Proposed
command once approved:

```bash
git filter-repo --replace-text supplier-names.txt --force   # then: git push --force origin main
```

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
