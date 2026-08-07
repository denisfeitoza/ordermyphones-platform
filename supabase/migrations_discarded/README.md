# Superseded migration drafts

Everything in this directory is **dead SQL**. It was never applied to the live
project `rdkkbiyugcjyrnkvobrr` and no tool (Supabase CLI, Supabase MCP, the
Management API) may apply it — that is exactly why it lives outside
`supabase/migrations/` instead of inside it. It is kept only as a field-level
reference for column names, constraint shapes, and ideas that later phases may
still want, per `docs/planning/DECISIONS-LOCKED.md` (D14).

The live schema starts fresh at `supabase/migrations/20260806120000_foundation_profiles.sql`
and every migration after it uses the CLI-compatible
`YYYYMMDDHHMMSS_snake_name.sql` timestamp convention.

## Why each file is dead

- **`0001_initial_schema.sql`** — pre-redesign identity/account model
  (`account_type`, `membership_role`, "individual/business" accounts). Phase 1
  replaces this with a single `profiles` row per `auth.users` row and a
  simpler `role`/`tier` shape (D12); the multi-account/membership concept was
  dropped before the roles decision was locked.
- **`0002_rls_policies.sql`** — role-check helper used
  `set search_path = public` (not `= ''`), which trips the Supabase linter's
  `function_search_path_mutable` finding and is a shadowing vector; its
  `profiles update self` policy also relied on a bare `WITH CHECK` with no
  column-level defense, which does not stop `UPDATE profiles SET role='admin'
  WHERE id=auth.uid()`. Both are corrected in `20260806120000_foundation_profiles.sql`
  (Legs 1–3 of the privilege-escalation defense — see `01-RESEARCH.md` Pattern 2).
- **`0003_pricing_tiers.sql`** — pricing/rules engine written before the
  tier enum and margin model in `docs/architecture/PRICING-ENGINE.md` were
  finalized; scaffolds land in a later Phase 1 plan against the current spec,
  not this draft.
- **`0004_supplier_sync.sql`** — `inventory_snapshots` point-in-time model
  predates the movement-ledger decision (`balance(variant, location) = sum of
  audited movements`, resolved 2026-08-06). The ledger tables in this phase
  supersede snapshot-based inventory entirely.
- **`0005_audit_log.sql`** — `ai_actions`/audit scaffolding written before the
  stock-locations and import-profile decisions; Phase 1's `audit_log` (if
  scaffolded) follows the current schema, not this shape. T-01-07 in this
  plan's threat model explicitly accepts the audit gap until then.
- **`seed.sql`** — targets the dead `0001`–`0005` schema (inserts into
  `public.tiers`, references suppliers by the old shape) **and** carries the
  literal supplier names `Assurant` and `Mannapov LLC` in what is a public
  repository. Relocating it here satisfies both the D14 disposition (dead
  schema) and the D16 confidentiality cleanup (no supplier literals in live,
  tool-reachable SQL). It is reference-only; do not resurrect the literal
  strings into any migration or client file.

## What's still live

`supabase/functions/{pricing-engine,tier-upgrade,stripe-webhook}/` reference
this same pre-redesign schema and are **not** relocated here — none are
deployed, so there is no risk of a tool applying them. They are left in place
as a known-stale artifact: `stripe-webhook` is out of v1.0 scope (Stripe
excluded per ADR), `pricing-engine` may seed Phase 3's pricing work. See the
Phase 1 Plan 01-01 SUMMARY for the full note.
