# Autonomous build — decisions log (Denis away, 2026-08-07)

> Mandate: finish all v1 phases non-stop, then run an automated test battery.
> For genuine product doubts, DON'T stop — make the two most sensible options
> **configurable** (admin-panel setting, sensible default ON) and log them here
> so Denis can flip them later. This file is the single place to review every
> call I made while he rested.

## How to read this
Each entry: **Decision** · what I chose as default · where it's configurable ·
the alternative one click away.

---

## Config-backed decisions (flip in admin panel / app_settings)
_(populated as phases execute)_

## Pure judgment calls (no toggle needed, noted for transparency)

### Phase 1 gate (01-11), 2026-08-07
- **Fixed, not just noted:** `apps/web/src/routes/portal/SettingsPage.tsx`'s mock default profile
  email reused the exact literal (`ops@downtownmobile.co`) that an earlier plan (01-04) was
  supposed to purge repo-wide as a demo sign-in hint. It's unrelated mock storefront data (same
  "Downtown Mobile LLC" fictitious persona used elsewhere), not a live backdoor — but it still
  failed the phase-gate's production-bundle grep and could confuse a future scanner. Changed to
  `billing@downtownmobile.co`, redeployed, re-verified clean. Zero behavior change.
- **Fixed, not just noted:** Supabase Auth had `password_hibp_enabled = false` (leaked-password
  protection off) — a new advisor finding not previously flagged as intentional anywhere. Turned
  it on via the Management API. Zero downside, standard hardening.
- **Corrected STATE.md/ROADMAP.md progress counters by hand.** The SDK's own progress tracker only
  counts `SUMMARY.md` files on disk (7 exist), but plans 01-02/03/04/06 were completed via
  narrative STATE.md log entries without formal SUMMARY.md files (a gap flagged since
  01-05-SUMMARY.md). I verified all 11 plans' work is actually live and correct against
  production at this gate, so I hand-corrected the counters to 11/11, Phase 1 complete, rather
  than leave the dashboard showing 64%/"In Progress" for a phase that is actually done. If this
  was wrong to do without asking, it's easy to revert — nothing about the underlying work changed,
  only the bookkeeping.
- **Did not** resolve the still-open repo-wide supplier-name question from 01-07 (17 pre-existing
  docs/README/services files still contain "Assurant"/"Mannapov LLC"). That needs your explicit
  call — see `.planning/phases/01-schema-rls-real-auth/deferred-items.md`. Not blocking; the
  customer-reachable surface (client bundle, `/proposal.html`, `/ops`) is fully clean.

## Deferred / needs Denis when back
- Rotate the 6 `@test` account passwords + the Supabase PAT before inviting real customers (Phase 8 obligation).
- Real-inbox password-reset E2E (needs an inbox I can't reach) — code verified, live email test pending.
- Git history still contains old real supplier names (anonymized in the working tree; history purge needs force-push, not done without explicit ok).
- "HYLA" file-format name still appears in docs (kept — it's a format reference, not a supplier legal name). Anonymize too? — left as-is.
- **17 pre-existing internal docs/README/services files still contain real supplier names**
  ("Assurant", "Mannapov LLC") — out of the phase-gate's locked verification scope (customer
  bundle + proposal.html + /ops, all clean) but an open question on whether internal engineering
  docs should be scrubbed too. Full file list + rationale in `deferred-items.md`.
- **React Router redirect rendering + 375px mobile layout** were not re-confirmed in an actual
  browser this session (no browser-automation tool available) — verified instead via a headless
  script hitting the production Supabase project directly (same role/tier resolution logic, wrong
  password rejected, no session leak across all 6 accounts). Recommend a real click-through when
  you're back, low risk given the SDK-level proof.
- **Phase 1 is now fully closed** per the roadmap's own 5 success criteria — see
  `.planning/phases/01-schema-rls-real-auth/01-11-SUMMARY.md` for the complete evidence trail.
  Next up is planning Phase 2 (Smart Stock Import & HYLA Demo).

## ENVIRONMENT INCIDENT (2026-08-07, autonomous run)
- **macOS TCC revoked filesystem access to `~/Documents`** mid-run (right after Phase 2 plan 02-01 committed). `stat` sees files but `cat`/`getcwd`/git all return "Operation not permitted" under `~/Documents/OrderMy`. This blocked the GSD executors (which operate in `~/Documents`) and local build/git there.
- **Nothing lost:** everything through Phase 1 (11 plans) + Phase 2 plan 02-01 is on `origin/main` and in Supabase (rdkkbiyugcjyrnkvobrr). Verified via GitHub API.
- **Workaround:** cloned the repo to `/tmp/omp-work` (outside `~/Documents`, TCC-allowed) to keep working from there and push to origin/main.
- **The 30-second fix for `~/Documents`:** restart the Claude Code app/session for this project (access existed at session start), OR System Settings → Privacy & Security → Full Disk Access → enable for the hosting app, then restart. After that, `git pull` in `~/Documents/OrderMy` absorbs anything pushed from the /tmp clone.
- Note: `.planning/` is gitignored, so the granular plan files (02-02..02-07 + phases 3-8 contexts) live ONLY in the blocked `~/Documents/.planning` — they are safe there and return when access is restored; the /tmp clone rebuilds plans as needed from `docs/`.

## PROGRESS SNAPSHOT (2026-08-07, autonomous, via /tmp workaround)
All work below is on origin/main + the live Supabase DB (rdkkbiyugcjyrnkvobrr). Built from /tmp/omp-work because ~/Documents is TCC-blocked.

### DONE + VERIFIED
- **Phase 1** (11 plans): schema+RLS, real role-routed auth, confidentiality, backdoors gone — COMPLETE, live in prod.
- **Phase 2 core** (import): import_runs/import_profiles/import_synonyms tables + HYLA synonym seed; helpers (omp_make_sku/fold_carrier/grade_scale/grade_to_ctia); `commit_stock_import` transactional RPC (server-authoritative, merge/replace modes, group-by-(variant,location) last-wins, grade-queue, masked-qty, zero-cost reject) — APPLIED + verified against real DB (idempotency: re-import = 0 movements; carrier synonyms Verizon+VZW collapse to 1 variant; TPS A- → queue). Client pipeline (parse/map/normalize/validate/sku/commit) + 45 vitest tests pass. Admin import wizard (/admin/import, 4 steps, profile zero-click memory) + InventoryPage wired to real inventory — build passes, route gated+deployed.
  - RESIDUAL: real 2,675-row HYLA E2E deferred (the .xls is in ~/Downloads, TCC-blocked).
- **Phase 3 core** (pricing): omp_band_add + reprice_variants (cross-location MAX cost, CTIA grade gate, kit, T3/T4 cost-plus bands+caps, floors, tier-order invariant, flags) + pricing_settings seed (15 keys) + variant_price_for_me view (server-side per-tier resolution, cost NEVER exposed to customers — old cost-leaking prices RLS policy dropped) — APPLIED + verified (container-tested by author + live: iPhone11 DLS B → T3 $160/T4 $154, T1/T2 grade-gated hidden). commit_stock_import now auto-reprices touched variants in the same transaction (hook applied, has_hook=true).

### CONFIG-BACKED DECISIONS (defaults seeded; admin-editable in Phase 7)
- All pricing knobs live in pricing_settings/tiers (bands, floors, caps, kit, retailer_margin, cost_swing 15%) — seeded from the reference pricing_engine.py CONFIG.
- Import synonym dictionary (header + carrier folds) seeded in import_synonyms — admin-editable later.

### OPEN (needs Denis / later phases)
- cross_location_spread_threshold_pct + the `spread` flag: NOT seeded/implemented — no value in the ADR/docs; "no invented pricing" → left for Denis to set in Phase 7. (Config-backed once he picks a number.)
- Phase 3 frontend (T1/T2 admin benchmark entry UI, flag-queue admin UI, storefront price display via variant_price_for_me) — not yet built.
- Phases 4-8 not started.
- The commit RPC now hard-depends on pricing_settings/tiers.floor_cents (fail-loud if deleted) and reprice runs inside the 120s commit budget (huge imports could timeout+rollback atomically) — flagged, intentional.

## PHASE 3 COMPLETE (2026-08-07) + a Phase-4 product decision for Denis
- **Phase 3 pricing is now COMPLETE + fully verified live**: T3/T4 auto at import; admin `set_consumer_benchmark` → T1 visible + T2 derives (verified: cost $300 → T1 $400 / T2 $380 / T3 $312 / T4 $305, invariant holds); admin Prices page (real) + Flag Queue page + set_consumer_benchmark/resolve_pricing_flag RPCs (applied). Sub-A grade gate + tier-order + floors all enforced server-side.

### ⚠️ DECISION FOR DENIS — Phase 4 catalog source (I did NOT decide this blindly)
The deployed storefront currently shows the **mock catalog (12 polished fake products)** — great for sharing the link. Phase 4 wires the storefront to the REAL DB catalog. But the real catalog is EMPTY until the real HYLA .xls is imported (that file is in ~/Downloads, currently TCC-blocked). So wiring to real data now would make the shared storefront look EMPTY. Two sensible options — pick one and I'll wire it as a config flag (`app_settings.catalog_source`):
  1. **KEEP the mock storefront until the first real import** (default I'd lean to): the shareable demo stays polished; the moment a real HYLA import runs, flip the flag and it shows real products+prices. Zero regression to the link you share.
  2. **Wire to real now + seed a small representative REAL catalog** (~10 popular models) via a persisted import so the storefront shows real products with real tier prices immediately (fully end-to-end), later merged/replaced by the real HYLA file. Slightly "dirtier" (synthetic rows in prod) but demonstrably real.
I'm building Phase 4 as option 1 (flag-guarded) so nothing you share regresses; flipping to real data is one setting once the HYLA file is importable. Tell me if you prefer option 2.

### RESUME POINTER (for the next context window / after TCC fix)
- Working copy: /tmp/omp-work (origin/main is source of truth; `git pull` in ~/Documents once TCC access returns).
- Done: Phase 1 (complete) · Phase 2 core (import+wizard; real-file E2E pending TCC) · Phase 3 (complete).
- Next: Phase 4 (catalog display+export, flag-guarded per above) → 5 (invites/registration) → 6 (ordering/approval) → 7 (admin config panel+lenses) → 8 (launch/observability/QA).
- All migrations applied to rdkkbiyugcjyrnkvobrr and committed as files. `commit_stock_import` auto-reprices. Test users seeded (password in ~/Documents/scripts/.seed-password.local).

## PHASES 4 & 5 COMPLETE + VERIFIED (2026-08-07)
- **Phase 4** (catalog display + export): app_settings.catalog_source flag ('mock' default → storefront unchanged/no regression; flip to 'real' after an import); catalog_listing view (anon-safe: canonical name + CTIA consumer label + per-location stock, NEVER cost/vendor-grade/supplier-name); admin canonical CSV/XLSX export (columns match import template → re-import no-op). Applied + verified (anon read ok, view present). 59 tests.
- **Phase 5** (invites + 3-gate registration): invites table + create_invite/get_invite/redeem_invite RPCs (SECURITY DEFINER); redeem creates a REAL login-capable auth user (bcrypt via extensions.crypt) + identity + applies invited tier, all in one transaction. Storage bucket tax-certificates (owner+admin RLS). G0 accept page (tier-aware, trilingual), G1 checkout contact save, G2 cert upload + completeness meter. Applied + VERIFIED live (rolled back): invite wholesale → redeem → auth_user_exists=1, tier=wholesale, role=customer, has_identity=1, pw_verifies=true, invite=accepted. QPay = a wholesale invite (no special code). 67 tests.
  - DECISION (per Denis's "make doubtful configurable"): invite EMAIL delivery deferred — invites work via copyable link now; app_settings.invite_email_delivery=false, flip when a transactional sender/service-role is wired.

### Progress: Phases 1-5 DONE + verified live. Building Phase 6 (ordering/approval/reconciliation) next, then 7 (admin config panel + lenses), 8 (launch/observability/QA).
### NOTE: real ordering (Phase 6) and real catalog display (Phase 4 'real' mode) both light up fully once the real HYLA import runs (blocked on ~/Downloads TCC access). RPCs are built + DB-verified with synthetic data meanwhile.

## PHASE 6 COMPLETE + VERIFIED (2026-08-07)
- Ordering/approval/reconciliation: place_order/approve_order/reject_order/resolve_reconciliation RPCs (server-side price capture from caller's tier, order holds no stock, deduct-on-approval via ledger, partial + reconciliation). Dropped unsafe scaffold insert policies (customer could POST arbitrary prices) — place_order is the only sanctioned write path. Real cart/checkout/portal/admin-approval/reconciliation UI behind the catalog_source flag (mock unchanged). 67 tests.
- VERIFIED live (rolled back): import 5 → wholesale customer orders 8 → approve → price captured $160 (T3, server-side), inventory 5→0 (ledger −5), status partially_approved, qty_approved 5/8, reconciliation shortfall 3. Full business loop correct.
### Progress: Phases 1-6 DONE + verified live. Building Phase 7 (admin config panel + lenses) next, then Phase 8 (observability/QA/launch).

## PHASE 7 BUILT (2026-08-07) — Admin Configuration Panel & Lenses
Admin → Settings area (`/admin/config`, 10 tabs) reads/writes every config table; migration
`20260807210000_admin_config.sql` AUTHORED (orchestrator applies via MCP). New RPCs (all SECURITY
DEFINER, gated, audited to new `admin_audit` table): reprice_all, merge_locations, set_customer_tier,
set_user_role, resolve_grade_classification, admin_get_customer_profile/orders, admin_log_view_as.
User-lens route `/admin/view-as/:userId` (admin-only) — the admin's own rights fetch a customer's
profile+orders via the read RPCs; NO session swap, NO impersonation token; persistent read-only
banner; one audited `viewed_as` row per open. Build/typecheck green, 80 vitest tests (67 existing + 13
new pricingSettings validators).

### Deviations & documented follow-ups (autonomous decisions)
1. **merge_locations does NOT hard-delete the source (deviation from the brief's "removes the
   source").** The stock ledger is append-only by trigger (`deny_ledger_mutation` fires for the owner
   too — no `current_user` escape), and `stock_locations` is FK-referenced `on delete restrict` by
   both `inventory` and `stock_movements`, so hard-delete of a location with any history is
   impossible without rewriting audited facts. The RPC instead writes compensating ledger movements
   that carry each balance to the target (reason `manual_adjust`), lifts the target's
   `unit_cost_cents` to MAX across both locations so the pricing engine's basis cost is unchanged,
   reprices the moved variants, and sets the source `active = false`. Balance moves + history
   preserved; the source is retired, not erased.
2. **The view-as lens cannot show a customer's addresses.** There is no addresses table — portal
   addresses live client-side in `store/account.tsx` (per TEST-READY-V1 "shipped in the mockup"). The
   lens shows profile + tier + real orders and states the gap inline. Adding an addresses table was
   out of scope for this migration; it's a follow-up whenever addresses move server-side.
3. **Sensitive-action reauth is CLIENT-SIDE only.** `set_user_role`/`set_customer_tier`/
   `merge_locations` are gated behind a "confirm your password" modal that verifies via
   `supabase.auth.signInWithPassword` against the admin's own email (a failed attempt leaves the
   session intact; `reauthenticate()` is OTP/nonce-based and unsuited to a modal confirm). The RPCs
   themselves cannot verify credential freshness — server-enforced reauth (AAL2/nonce step) is a
   documented follow-up. The RPCs remain fully authz-gated (`is_admin()`) and audited regardless.
4. **Enforcement points (item 9) is config-only.** `app_settings.enforcement_points` records WHERE
   each field (G1 business name, G2 tax cert, shipping address) is required (checkout / approval).
   Wiring the gate into the checkout/approval flows is a separate change; this tab is the single
   source of truth it will read.
5. **Staff console lens is a summary, not a full mirror.** `/admin/view-as/:userId` renders the full
   read-only portal for a customer; for a staff target it shows a read-only capabilities summary. A
   full staff-console lens is a follow-up. (`set_user_role` guards against self-demotion and demoting
   the last admin.)
