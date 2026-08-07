-- 20260807130000_import_tables.sql
-- Phase 2 Plan 02-01: import_runs (commit audit), import_profiles (remap
-- memory keyed by supplier + header fingerprint), import_synonyms (DB
-- synonym dictionary, three-layer MAP layer 1), the HYLA header + carrier
-- synonym seed, and the suppliers.vendor_code bridge column.
--
-- Policy call convention (Phase 1, unchanged): using ( (select
-- public.is_admin_or_staff()) ) / (select public.is_admin()) — always
-- (select ...)-wrapped, InitPlan-hoisted, always `to authenticated`.
--
-- D16 (repo is PUBLIC): no real supplier legal name anywhere in this file.
-- Suppliers are referenced only by FK / code / anon_label.

------------------------------------------------------------------
-- A. public.import_runs — audit of every commit (written by the 02-05 RPC).
------------------------------------------------------------------
create table public.import_runs (
  id                 uuid primary key default gen_random_uuid(),
  supplier_id        uuid references public.suppliers(id) on delete restrict,
  location_scope     text,                                    -- null = merge across all warehouses; a location code for replace mode
  mode               text not null check (mode in ('merge', 'replace_location')),
  source_label       text,                                    -- D16: file BASENAME only, never a full path, never a real supplier legal name; caller sanitizes
  header_fingerprint text,
  rows_total         integer not null default 0,
  rows_accepted      integer not null default 0,
  rows_rejected      integer not null default 0,
  movements_written  integer not null default 0,
  reject_reasons     jsonb not null default '[]'::jsonb,       -- compact array of {row, reason}
  actor_id           uuid references public.profiles(id),      -- T-01-28: import identity, populated by the RPC from auth.uid()
  created_at         timestamptz not null default now()
);

comment on column public.import_runs.source_label is
  'D16: file BASENAME only — never a full filesystem path, never a real supplier legal name. Caller (02-05/02-06) sanitizes before writing.';

create index import_runs_supplier_id_idx on public.import_runs (supplier_id);
create index import_runs_created_at_idx  on public.import_runs (created_at desc);

alter table public.import_runs enable row level security;

create policy "import_runs staff read"  on public.import_runs for select to authenticated
  using ( (select public.is_admin_or_staff()) );
create policy "import_runs staff write" on public.import_runs for all to authenticated
  using ( (select public.is_admin_or_staff()) ) with check ( (select public.is_admin_or_staff()) );
-- No customer policy — a customer session querying this table directly gets
-- zero rows, never an error and never data.

------------------------------------------------------------------
-- B. public.import_profiles — the remap memory (SMART-STOCK-IMPORT.md
-- "Mapping profiles"). Keyed (supplier, header_fingerprint) so a repeat
-- upload of the same layout needs zero mapping clicks.
------------------------------------------------------------------
create table public.import_profiles (
  id                  uuid primary key default gen_random_uuid(),
  supplier_id         uuid not null references public.suppliers(id) on delete cascade,
  header_fingerprint  text not null,                            -- hash(sorted normalized headers), computed client-side
  sheet_name          text,                                     -- chosen sheet (DETECT)
  header_row          integer,                                  -- chosen header row index (DETECT)
  column_map          jsonb not null default '{}'::jsonb,        -- { sourceHeader: canonicalField }
  normalizer_options  jsonb not null default '{}'::jsonb,
  version             integer not null default 1,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (supplier_id, header_fingerprint)
);

create trigger trg_import_profiles_set_updated_at
  before update on public.import_profiles
  for each row execute function public.set_updated_at();

create index import_profiles_supplier_id_idx on public.import_profiles (supplier_id);

alter table public.import_profiles enable row level security;

create policy "import_profiles staff read"  on public.import_profiles for select to authenticated
  using ( (select public.is_admin_or_staff()) );
create policy "import_profiles staff write" on public.import_profiles for all to authenticated
  using ( (select public.is_admin_or_staff()) ) with check ( (select public.is_admin_or_staff()) );
-- No customer policy.

------------------------------------------------------------------
-- C. public.import_synonyms — the DB synonym dictionary (three-layer MAP,
-- layer 1: synonym dictionary -> layer 2: fuzzy header -> layer 3: content
-- inference). Admin-editable later (Phase 7); seeded here with the HYLA
-- layout so the real file auto-maps zero-click on first sight, and with the
-- carrier-value fold the server (02-04) uses to normalize raw carrier text.
------------------------------------------------------------------
create table public.import_synonyms (
  id              uuid primary key default gen_random_uuid(),
  canonical_field text not null,                                -- 'quantity','cost','carrier','warehouse','make','model','model_number','capacity','color','grade','lock_status','category','currency','description'
  synonym         text not null,                                -- normalized (lower, trimmed, single-spaced) token
  kind            text not null default 'header' check (kind in ('header', 'carrier_value')),
  maps_to         text,                                         -- for kind='carrier_value': the canonical carrier CODE (ATT/VZW/... ) this raw value folds to
  created_at      timestamptz not null default now(),
  unique (canonical_field, synonym, kind)
);

alter table public.import_synonyms enable row level security;

create policy "import_synonyms read all authenticated" on public.import_synonyms for select to authenticated
  using ( true );
create policy "import_synonyms admin write" on public.import_synonyms for all to authenticated
  using ( (select public.is_admin()) ) with check ( (select public.is_admin()) );
-- import_synonyms is non-sensitive mapping metadata the wizard needs at
-- MAP time for every signed-in session — read-all-authenticated is
-- intentional (T-02-03). Writes are admin-only.

------------------------------------------------------------------
-- D. Seed import_synonyms — HYLA header synonyms (kind='header') and the
-- full carrier-value fold (kind='carrier_value'). Re-runnable via
-- on conflict (canonical_field, synonym, kind) do update.
------------------------------------------------------------------
insert into public.import_synonyms (canonical_field, synonym, kind, maps_to) values
  -- quantity
  ('quantity', 'qty', 'header', null),
  ('quantity', 'quantity', 'header', null),
  ('quantity', 'quantity available', 'header', null),
  ('quantity', 'units', 'header', null),
  ('quantity', 'on hand', 'header', null),
  -- cost
  ('cost', 'price', 'header', null),
  ('cost', 'cost', 'header', null),
  ('cost', 'unit cost', 'header', null),
  ('cost', 'vendor cost', 'header', null),
  -- warehouse
  ('warehouse', 'warehouse', 'header', null),
  ('warehouse', 'location', 'header', null),
  ('warehouse', 'wh', 'header', null),
  ('warehouse', 'site', 'header', null),
  ('warehouse', 'region', 'header', null),
  -- make / model / model_number
  ('make', 'make', 'header', null),
  ('model', 'model', 'header', null),
  ('model_number', 'model number', 'header', null),
  ('model_number', 'mpn', 'header', null),
  -- capacity / color
  ('capacity', 'capacity', 'header', null),
  ('color', 'color', 'header', null),
  -- carrier
  ('carrier', 'carrier', 'header', null),
  -- lock_status
  ('lock_status', 'lock status', 'header', null),
  ('lock_status', 'lock', 'header', null),
  -- grade
  ('grade', 'grade', 'header', null),
  -- category
  ('category', 'category', 'header', null),
  -- currency
  ('currency', 'currency', 'header', null),
  -- description
  ('description', 'description', 'header', null),

  -- carrier-value fold (raw label -> canonical carrier CODE)
  ('carrier', 'att', 'carrier_value', 'ATT'),
  ('carrier', 'at&t', 'carrier_value', 'ATT'),
  ('carrier', 'vzw', 'carrier_value', 'VZW'),
  ('carrier', 'verizon', 'carrier_value', 'VZW'),
  ('carrier', 't-mobile', 'carrier_value', 'TMO'),
  ('carrier', 'tmo', 'carrier_value', 'TMO'),
  ('carrier', 'sprint', 'carrier_value', 'SPR'),
  ('carrier', 'boost', 'carrier_value', 'BST'),
  ('carrier', 'spectrum', 'carrier_value', 'SPC'),
  ('carrier', 'xfinity', 'carrier_value', 'XFI'),
  ('carrier', 'unl', 'carrier_value', 'UNL'),
  ('carrier', 'unlocked', 'carrier_value', 'UNL'),
  ('carrier', 'oth', 'carrier_value', 'OTH'),
  ('carrier', 'other', 'carrier_value', 'OTH'),
  ('carrier', 'generic', 'carrier_value', 'OTH'),
  ('carrier', 'xaa generic', 'carrier_value', 'OTH'),
  ('carrier', 'xag generic', 'carrier_value', 'OTH'),
  ('carrier', 'wi-fi only', 'carrier_value', 'OTH')
on conflict (canonical_field, synonym, kind) do update
  set maps_to = excluded.maps_to;

------------------------------------------------------------------
-- E. suppliers.vendor_code bridge (BLOCKER — keys vendor_grade_map /
-- grade_classification_queue for imports).
--
-- This migration adds ONLY the nullable column. The VALUE (source-1 ->
-- 'HYLA') is seeded live-DB-only via the gitignored scripts/seed-suppliers.mjs
-- (Task 3), reading scripts/.suppliers.local.json — never written here. This
-- keeps the source-1<->vendor mapping out of committed SQL (D16), while
-- still giving commit_stock_import (02-05) and the wizard (02-06) one
-- source of truth to key the grade map by, instead of inventing a code.
------------------------------------------------------------------
alter table public.suppliers add column if not exists vendor_code text;

comment on column public.suppliers.vendor_code is
  'Keys vendor_grade_map / grade_classification_queue for imports. The VALUE is seeded live-DB-only via scripts/seed-suppliers.mjs (Phase 2 Plan 02-01 Task 3), never written in this migration (D16).';
