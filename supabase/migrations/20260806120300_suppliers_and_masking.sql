-- 20260806120300_suppliers_and_masking.sql
-- Phase 1 Plan 01-07: admin-gated public.suppliers, stock_locations.supplier_id,
-- and the five customer-facing masking views (FOUND-02 / D16 server-side half).
--
-- ORCHESTRATOR OVERRIDE (D16, 2026-08-06): the repo is PUBLIC. Unlike the
-- plan's literal Task 1 text, this migration does NOT insert the two real
-- supplier legal names ('Assurant', 'Mannapov LLC'). Only the table shape,
-- RLS, and the masking views are committed here. The two real rows are
-- inserted separately, live-DB-only, by the gitignored scripts/seed-suppliers.mjs
-- reading a gitignored scripts/.suppliers.local.json — never by this file.
-- See 01-07-SUMMARY.md for the full rationale and the git-grep proof.

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
