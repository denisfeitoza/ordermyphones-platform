-- 20260806120400_pricing_scaffold.sql
-- Phase 1 Plan 01-09: pricing scaffold — tiers, pricing_settings,
-- vendor_grade_map (+HYLA seed), grade_classification_queue, prices,
-- pricing_flags. SCAFFOLD ONLY: tables + constraints + RLS. The pricing
-- MATH (the waterfall, benchmark fetch, flag transitions) is Phase 3 —
-- see docs/architecture/PRICING-ENGINE.md and 01-CONTEXT.md.
--
-- Policy call convention (matches prior migrations in this phase):
-- using ( (select public.is_admin_or_staff()) ), always `to authenticated`
-- so `anon` short-circuits. See 01-RESEARCH.md Pattern 1.

------------------------------------------------------------------
-- A. public.tiers — D12 + PRICING-ENGINE.md §1. Seeded, re-runnable.
------------------------------------------------------------------
create table public.tiers (
  code       public.customer_tier primary key,
  label      text not null,
  min_units  integer not null,
  max_units  integer,                 -- null = unbounded (distributor)
  floor_cents bigint not null,
  position   smallint not null unique
);

comment on table public.tiers is
  'The live app''s data/tiers.ts still carries the v1 labels (Multi-Store / Wholesale, 401+ boundary) — PRICING-ENGINE.md §10 tracks that divergence as a Phase 3/4 frontend follow-up, not this plan''s job.';

insert into public.tiers (code, label, min_units, max_units, floor_cents, position) values
  ('consumer',    'Consumer',    1,   9,    1000, 1),
  ('retailer',    'Retailer',    10,  49,   500,  2),
  ('wholesale',   'Wholesale',   50,  399,  250,  3),
  ('distributor', 'Distributor', 400, null, 100,  4)
on conflict (code) do update set
  label = excluded.label,
  min_units = excluded.min_units,
  max_units = excluded.max_units,
  floor_cents = excluded.floor_cents,
  position = excluded.position;

------------------------------------------------------------------
-- B. public.pricing_settings — key/value so Phase 7 can make it
-- admin-editable without a migration (D10). Seeded from the reference
-- CONFIG (services/pricing-batch/reference/pricing_engine.py lines 29-68),
-- all money converted to integer cents (PRICING-ENGINE.md §6 — no float
-- touches persisted money).
------------------------------------------------------------------
create table public.pricing_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

create trigger trg_pricing_settings_set_updated_at
  before update on public.pricing_settings
  for each row execute function public.set_updated_at();

-- Floors live on tiers.floor_cents, not duplicated here — one source of truth.
insert into public.pricing_settings (key, value) values
  ('retailer_min_margin_cents',   '2000'),
  ('kit_cost_premium_cents',      '500'),
  ('kit_cost_standard_cents',     '300'),
  ('kit_premium_threshold_cents', '30000'),
  ('wholesale_bands', '[
     {"max_cost_cents":10000,"markup_cents":700},
     {"max_cost_cents":30000,"markup_cents":1000},
     {"max_cost_cents":60000,"markup_cents":1200},
     {"max_cost_cents":null,"markup_cents":1500}
   ]'::jsonb),
  ('distributor_bands', '[
     {"max_cost_cents":10000,"markup_cents":300},
     {"max_cost_cents":30000,"markup_cents":400},
     {"max_cost_cents":60000,"markup_cents":500},
     {"max_cost_cents":null,"markup_cents":600}
   ]'::jsonb),
  ('premium_cost_threshold_cents', '80000'),
  ('wholesale_pct_cap',            '0.04'),
  ('distributor_pct_cap',          '0.025'),
  ('outlier_trim_pct',             '0.30'),
  ('min_sources_high_confidence',  '3'),
  ('locked_discount',              '0.90'),
  ('fallback_multipliers', '{"NEW":1.55,"CPO":1.50,"A":1.45,"B":1.38,"C":1.32,"D":1.20}'::jsonb),
  ('fallback_default_multiplier',  '1.38'),
  ('cost_change_review_pct',       '0.15')
on conflict (key) do update set value = excluded.value, updated_at = now();

comment on table public.pricing_settings is
  'Key/value margin structure (floors excluded — see public.tiers) so Phase 7 can make it admin-editable without a migration (D10). Deliberately does NOT seed cross_location_spread_threshold_pct: SMART-STOCK-IMPORT.md calls it "configurable" with no figure, so any value here would be invented — see 01-09-SUMMARY.md, tracked as a Phase 3 input the user must supply. The same rule applies to any other setting not traceable to CONFIG, PRICING-ENGINE.md or the ADR.';

------------------------------------------------------------------
-- C. public.vendor_grade_map — per-vendor CTIA grade map (PRICING-ENGINE.md
-- §2 / PRODUCT-CATALOG-STANDARD.md §3). HYLA seed: exactly 13 rows.
------------------------------------------------------------------
create table public.vendor_grade_map (
  id           uuid primary key default gen_random_uuid(),
  vendor_code  text not null,
  vendor_grade text not null,           -- verbatim, suffix preserved
  ctia         public.ctia_grade not null,
  created_at   timestamptz not null default now(),
  unique (vendor_code, vendor_grade)
);

comment on table public.vendor_grade_map is
  'DLS A+ and DLS A map to CTIA B, not A — DLS grades sit one full notch below their TPS letter (field experience, not letter arithmetic). The letter-arithmetic version of this table was wrong and reclassified ~17% of the real HYLA feed incorrectly (PRICING-ENGINE.md §2). Do not "correct" it back.';

insert into public.vendor_grade_map (vendor_code, vendor_grade, ctia) values
  ('HYLA', 'TPS A+',  'A'),
  ('HYLA', 'TPS A',   'A'),
  ('HYLA', 'DLS AA+', 'A'),
  ('HYLA', 'DLS A+',  'B'),
  ('HYLA', 'DLS A',   'B'),
  ('HYLA', 'DLS B+',  'B'),
  ('HYLA', 'DLS B',   'B'),
  ('HYLA', 'TPS B+',  'B'),
  ('HYLA', 'TPS B-',  'C'),
  ('HYLA', 'TPS C+',  'C'),
  ('HYLA', 'TPS C-',  'C'),
  ('HYLA', 'DLS C',   'C'),
  ('HYLA', 'TPS D',   'D')
on conflict (vendor_code, vendor_grade) do update set ctia = excluded.ctia;

-- DELIBERATELY NOT SEEDED: the orphan grade "TPS 'A' with a trailing minus
-- suffix" appears in the real HYLA feed but in no grade map
-- (PRICING-ENGINE.md §2 "Open item — orphan grade"; see also
-- 01-09-PLAN.md's "Known open item"). Leaving it unmapped is what routes it
-- to grade_classification_queue with the safe CTIA C default until an
-- admin classifies it once — classifying it is an explicit Phase 8 gate
-- item (LNCH-02). Do NOT add a row for it here. (Deliberately not spelled
-- out as the literal vendor-grade string in this comment — this
-- migration's own automated verify step greps for that exact literal to
-- prove no row was seeded, and the comment must not trip its own guard.)

------------------------------------------------------------------
-- D. public.grade_classification_queue — unknown-grade landing zone.
------------------------------------------------------------------
create type public.classification_status as enum ('pending', 'classified', 'ignored');

create table public.grade_classification_queue (
  id             uuid primary key default gen_random_uuid(),
  vendor_code    text not null,
  vendor_grade   text not null,
  first_seen_at  timestamptz not null default now(),
  occurrences    integer not null default 1,
  status         public.classification_status not null default 'pending',
  resolved_ctia  public.ctia_grade,
  resolved_by    uuid references public.profiles(id),
  resolved_at    timestamptz,
  unique (vendor_code, vendor_grade)
);

comment on table public.grade_classification_queue is
  'An unmapped grade is gated to T3/T4 as CTIA C (the engine''s safe default) until an admin classifies it once — it is never a row rejection.';

------------------------------------------------------------------
-- E. public.prices — one row per (variant, tier). Consolidated per variant,
-- not per location: SMART-STOCK-IMPORT.md's v1 rule computes from the
-- highest cost among in-stock locations.
------------------------------------------------------------------
create table public.prices (
  id               uuid primary key default gen_random_uuid(),
  variant_id       uuid not null references public.product_variants(id) on delete cascade,
  tier             public.customer_tier not null,
  price_cents      bigint not null check (price_cents > 0),
  visible          boolean not null default false,
  flag_reason      text,
  basis_cost_cents bigint,
  computed_at      timestamptz not null default now(),
  source           text not null default 'import',
  unique (variant_id, tier)
);

create index prices_tier_visible_idx on public.prices (tier, visible);

comment on table public.prices is
  'Consolidated per variant (not per location) — SMART-STOCK-IMPORT.md v1 rule computes from the highest cost among in-stock locations, so one price per (variant, tier).';

comment on column public.prices.visible is
  'Defaults to false — a price is hidden until something deliberately publishes it, so a half-finished Phase 3 run can never expose an unvalidated price (T-01-56).';

------------------------------------------------------------------
-- F. public.pricing_flags — admin flag queue (PRICING-ENGINE.md §5).
------------------------------------------------------------------
create type public.pricing_flag_kind as enum
  ('cost_swing', 'margin', 'unbenchmarked', 'tier_order', 'spread', 'collision', 'zero_qty');
create type public.pricing_flag_status as enum
  ('open', 'overridden', 'acknowledged', 'watching', 'resolved');

create table public.pricing_flags (
  id                   uuid primary key default gen_random_uuid(),
  variant_id           uuid not null references public.product_variants(id) on delete cascade,
  tier                 public.customer_tier,        -- null = affects all tiers
  kind                 public.pricing_flag_kind not null,
  payload              jsonb not null default '{}'::jsonb,
  status               public.pricing_flag_status not null default 'open',
  override_price_cents bigint,
  override_expires_at  timestamptz,
  actor_id             uuid references public.profiles(id),
  created_at           timestamptz not null default now(),
  resolved_at          timestamptz
);

create index pricing_flags_status_created_idx on public.pricing_flags (status, created_at desc);

comment on table public.pricing_flags is
  'The three admin actions in PRICING-ENGINE.md §5 map to status: overridden (30-day expiry, audited), acknowledged and watching.';

------------------------------------------------------------------
-- G. RLS — every table in this migration (D15, no exceptions).
------------------------------------------------------------------
alter table public.tiers                       enable row level security;
alter table public.pricing_settings             enable row level security;
alter table public.vendor_grade_map             enable row level security;
alter table public.grade_classification_queue   enable row level security;
alter table public.prices                       enable row level security;
alter table public.pricing_flags                enable row level security;

-- tiers, vendor_grade_map: product information the storefront already
-- shows (tier labels, quantity bands, CTIA taxonomy) — readable by every
-- signed-in user; write restricted to admin.
create policy "tiers read all authenticated" on public.tiers
  for select to authenticated using ( true );
create policy "tiers admin write" on public.tiers
  for all to authenticated
  using ( (select public.is_admin()) ) with check ( (select public.is_admin()) );

create policy "vendor_grade_map read all authenticated" on public.vendor_grade_map
  for select to authenticated using ( true );
create policy "vendor_grade_map admin write" on public.vendor_grade_map
  for all to authenticated
  using ( (select public.is_admin()) ) with check ( (select public.is_admin()) );

-- pricing_settings: admin/staff only for BOTH read and write. This table
-- holds the floors, markup bands, kit costs and percentage caps — OMP's
-- entire margin structure. A wholesale customer who can read
-- wholesale_bands can derive what OMP pays per unit, the same class of
-- exposure as unit_cost_cents (DATA-CLASSIFICATION.md). Nothing on the
-- storefront needs it; tiers is what the UI renders (T-01-57).
create policy "pricing_settings staff read" on public.pricing_settings
  for select to authenticated using ( (select public.is_admin_or_staff()) );
create policy "pricing_settings admin write" on public.pricing_settings
  for all to authenticated
  using ( (select public.is_admin()) ) with check ( (select public.is_admin()) );

-- grade_classification_queue, pricing_flags: admin/staff only, both read
-- and write.
create policy "grade_classification_queue staff all" on public.grade_classification_queue
  for all to authenticated
  using ( (select public.is_admin_or_staff()) ) with check ( (select public.is_admin_or_staff()) );

create policy "pricing_flags staff all" on public.pricing_flags
  for all to authenticated
  using ( (select public.is_admin_or_staff()) ) with check ( (select public.is_admin_or_staff()) );

-- prices — the one policy with real logic. Two permissive SELECT policies
-- OR together: staff see everything, a customer sees only their own
-- assigned tier's visible rows. The tier comes from profiles via a
-- SECURITY DEFINER lookup (public.current_customer_tier()), so no URL
-- parameter, cookie or client state can change it — PRICE-01's
-- server-side-tier invariant, enforced at the database rather than in the
-- SPA (T-01-50).
create policy "prices staff read" on public.prices for select to authenticated
  using ( (select public.is_admin_or_staff()) );

create policy "prices own tier read" on public.prices for select to authenticated
  using ( visible and tier = (select public.current_customer_tier()) );

create policy "prices staff write" on public.prices for all to authenticated
  using ( (select public.is_admin_or_staff()) ) with check ( (select public.is_admin_or_staff()) );
