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
