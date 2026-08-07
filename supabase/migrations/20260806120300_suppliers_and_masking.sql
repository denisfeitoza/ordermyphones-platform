-- 20260806120300_suppliers_and_masking.sql
-- Phase 1 Plan 01-07: admin-gated public.suppliers, stock_locations.supplier_id,
-- and the five customer-facing masking views (FOUND-02 / D16 server-side half).
--
-- ORCHESTRATOR OVERRIDE (D16, 2026-08-06): the repo is PUBLIC. Unlike the
-- plan's literal Task 1 text, this migration does NOT insert the two real
-- supplier legal names. Only the table shape, RLS, and the masking views
-- are committed here. The two real rows are inserted separately, live-DB-
-- only, by the gitignored scripts/seed-suppliers.mjs reading a gitignored
-- scripts/.suppliers.local.json — never by this file. See 01-07-SUMMARY.md
-- for the full rationale and the git-grep proof.

------------------------------------------------------------------
-- A. public.suppliers — admin/staff-only. No customer policy at all.
------------------------------------------------------------------
create type public.supplier_kind as enum ('dropship','wholesale','reverse_logistics','other');

create table public.suppliers (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,          -- stable abstraction: 'source-1', 'source-2'
  legal_name   text not null,                 -- CONFIDENTIAL — admin/staff only
  anon_label   text not null,                 -- 'Source A' / 'Source B' — safe for customers
  country      text,
  kind         public.supplier_kind not null default 'other',
  active       boolean not null default true,
  notes        text,                          -- CONFIDENTIAL — commercial terms etc.
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger trg_suppliers_set_updated_at
  before update on public.suppliers
  for each row execute function public.set_updated_at();

comment on column public.suppliers.legal_name is
  'CONFIDENTIAL (D16). Never expose outside an admin/staff session. Customer surfaces use anon_label. Real values are never committed to this repo (public) — seeded live-DB-only via gitignored scripts/seed-suppliers.mjs.';

comment on column public.suppliers.notes is
  'CONFIDENTIAL — commercial terms etc. Admin/staff read only, never surfaced to customers.';

alter table public.suppliers enable row level security;

create policy "suppliers staff read"  on public.suppliers for select to authenticated
  using ( (select public.is_admin_or_staff()) );
create policy "suppliers admin write" on public.suppliers for all to authenticated
  using ( (select public.is_admin()) ) with check ( (select public.is_admin()) );
-- No customer policy — a customer session querying this table directly gets
-- zero rows, never an error and never data. Customer surface is
-- suppliers_public (Section C below).

-- Belt and braces against a future blanket schema-level grant: this table
-- must never be readable by anon regardless of RLS.
revoke select on public.suppliers from anon;

------------------------------------------------------------------
-- B. Link stock_locations -> suppliers
-- A location belongs to at most one supplier; one supplier spans several
-- locations (e.g. HYLA-equivalent ships across multiple codes) — per
-- PRODUCT-CATALOG-STANDARD.md §5.
------------------------------------------------------------------
alter table public.stock_locations
  add column supplier_id uuid references public.suppliers(id) on delete set null;
create index stock_locations_supplier_id_idx on public.stock_locations (supplier_id);

------------------------------------------------------------------
-- C. Customer-facing masking views.
--
-- Every view below is a PLAIN `create view` — never security_invoker,
-- ever — with an explicit column allow-list (never `select *`,
-- which would silently start leaking the day a column is added to a base
-- table). See .planning/phases/01-schema-rls-real-auth/01-RESEARCH.md
-- Pattern 3 for the full rationale.
--
-- Why NOT security_invoker: a plain CREATE VIEW runs with the view owner's
-- rights and therefore bypasses the base table's RLS, returning exactly the
-- columns the view selects. Supabase's security advisor will flag this
-- shape as `security_definer_view` and suggest adding
-- `security_invoker = true`. APPLYING THAT SUGGESTION BREAKS THE PRODUCT
-- SILENTLY: customers have no SELECT policy on any base table here, so an
-- invoker-rights view would return ZERO ROWS for every customer. That
-- presents as "the catalog is empty" — a data bug, not a security alert —
-- and is easy to misdiagnose for hours. Do not apply the linter suggestion
-- on any of these five views.
------------------------------------------------------------------

create view public.suppliers_public as
  select id, code, anon_label from public.suppliers where active;
comment on view public.suppliers_public is
  'Customer-facing projection. Intentionally NOT security_invoker — see .planning/phases/01-schema-rls-real-auth/01-RESEARCH.md Pattern 3. Adding security_invoker = true makes this return ZERO rows for every customer (they hold no SELECT policy on the base table), which presents as an empty catalog rather than as a security alert. Do not apply the Supabase linter suggestion here.';

create view public.stock_locations_public as
  select id, code, display_name, region, active from public.stock_locations where active;
  -- supplier_id deliberately omitted: it is a free grouping side-channel (a
  -- customer could correlate which locations share a supplier) that costs
  -- nothing to close now, before Phase 4 exposes per-location breakdowns.
comment on view public.stock_locations_public is
  'Customer-facing projection. Intentionally NOT security_invoker — see .planning/phases/01-schema-rls-real-auth/01-RESEARCH.md Pattern 3. Adding security_invoker = true makes this return ZERO rows for every customer (they hold no SELECT policy on the base table), which presents as an empty catalog rather than as a security alert. Do not apply the Supabase linter suggestion here.';

create view public.products_public as
  select id, make, model, model_number, product_family, category from public.products;
comment on view public.products_public is
  'Customer-facing projection. Intentionally NOT security_invoker — see .planning/phases/01-schema-rls-real-auth/01-RESEARCH.md Pattern 3. Adding security_invoker = true makes this return ZERO rows for every customer (they hold no SELECT policy on the base table), which presents as an empty catalog rather than as a security alert. Do not apply the Supabase linter suggestion here.';

create view public.product_variants_public as
  select id, product_id, capacity, color, carrier, lock_status, sku
    from public.product_variants;
  -- `grade` (raw vendor label, e.g. 'DLS B+') and `carrier_raw` are omitted:
  -- CTLG-01 makes raw vendor grades admin-side only. The consumer-facing
  -- CTIA label arrives in Phase 3/4 via vendor_grade_map, as a separate
  -- exposed column — not by exposing `grade`.
comment on view public.product_variants_public is
  'Customer-facing projection. Intentionally NOT security_invoker — see .planning/phases/01-schema-rls-real-auth/01-RESEARCH.md Pattern 3. Adding security_invoker = true makes this return ZERO rows for every customer (they hold no SELECT policy on the base table), which presents as an empty catalog rather than as a security alert. Do not apply the Supabase linter suggestion here.';

create view public.inventory_public as
  select variant_id, location_id, qty, qty_is_floor, as_of from public.inventory;
  -- omits unit_cost_cents and source_import_id.
comment on view public.inventory_public is
  'Customer-facing projection. Intentionally NOT security_invoker — see .planning/phases/01-schema-rls-real-auth/01-RESEARCH.md Pattern 3. Adding security_invoker = true makes this return ZERO rows for every customer (they hold no SELECT policy on the base table), which presents as an empty catalog rather than as a security alert. Do not apply the Supabase linter suggestion here.';

grant select on public.suppliers_public, public.stock_locations_public,
               public.products_public, public.product_variants_public,
               public.inventory_public
  to authenticated, anon;
-- Keep the anon grant: anonymous storefront browsing is the intended path
-- once Phase 4 wires the catalog, and every base-table policy above is `to
-- authenticated`, so `anon` short-circuits everywhere else.
