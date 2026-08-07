-- 20260806120100_catalog_products_variants.sql
-- Phase 1 Plan 01-05: catalog identity layer 1 (products) and layer 2
-- (product_variants) per docs/architecture/PRODUCT-CATALOG-STANDARD.md.
-- RLS enabled on both tables in this same migration (D15, no exceptions).
--
-- Policy call convention (matches 20260806120000_foundation_profiles.sql /
-- 01-RESEARCH.md Pattern 1): using ( (select public.is_admin_or_staff()) ),
-- always `to authenticated` so `anon` short-circuits.

------------------------------------------------------------------
-- A. Catalog taxonomy enums
------------------------------------------------------------------
create type public.product_category as enum ('phones', 'accessories', 'wearables');
create type public.lock_status      as enum ('locked', 'unlocked');
create type public.carrier_code     as enum ('ATT','VZW','TMO','SPR','BST','XFI','SPC','UNL','OTH');
create type public.grade_scale      as enum ('DLS','TPS','OTHER');

-- ctia_grade is a catalog-taxonomy concept created here, but it is NOT a
-- column on product_variants. CTIA grade is derived from (vendor_code,
-- grade) via the vendor_grade_map table landing in plan 01-09. Denormalizing
-- it onto the variant would create two sources of truth the moment an admin
-- reclassifies a grade.
create type public.ctia_grade as enum ('NEW','CPO','A','B','C','D');

------------------------------------------------------------------
-- B. public.products — layer 1 (PRODUCT-CATALOG-STANDARD.md §1, §2)
------------------------------------------------------------------
create table public.products (
  id             uuid primary key default gen_random_uuid(),
  make           text not null,
  model          text not null,
  model_number   text not null,
  -- product_family is phones-only by design (§2.2) — nullable, not
  -- required, so a validator does not wrongly demand it on an AirPods row.
  product_family text,
  category       public.product_category not null,
  -- Forward-compatible home for §2.3 "reserved" fields (Screen Size, RAM,
  -- Launch Date, etc.) — a feed that starts populating them needs no
  -- migration, just a new key in this jsonb blob.
  attributes     jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (make, model_number)
);

create trigger trg_products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

comment on column public.products.attributes is
  'Forward-compatible reserved fields (Screen Size, RAM, Launch Date, ...) per PRODUCT-CATALOG-STANDARD.md §2.3. Not schema-enforced.';

------------------------------------------------------------------
-- C. public.product_variants — layer 2 (§1, §3 grade, §4 carrier, §6 SKU)
------------------------------------------------------------------
create table public.product_variants (
  id           uuid primary key default gen_random_uuid(),
  -- restrict, not cascade: deleting a product with live inventory/variants
  -- must fail loudly, never silently cascade-delete stock history.
  product_id   uuid not null references public.products(id) on delete restrict,
  capacity     text not null,
  -- color may be unknown (`*` in the vendor feed) and is stored null.
  color        text,
  carrier      public.carrier_code not null,
  carrier_raw  text not null,
  lock_status  public.lock_status not null,
  -- Vendor grade label kept VERBATIM including +/- suffix. Dropping the
  -- suffix collapsed 2,675 real rows into 2,331 fake duplicates — see
  -- PRODUCT-CATALOG-STANDARD.md §3 and 01-CONTEXT.md.
  grade        text not null,
  grade_scale  public.grade_scale not null,
  protocol     text,
  -- Deterministic SKU (§6, including the GRADE_TOKEN suffix encoding) is
  -- import-pipeline logic that lands in Phase 2 — NOT computed in the
  -- database. This column is `not null unique`; the writer supplies the
  -- value. Do not go looking for a generator function here.
  sku          text not null unique,
  attributes   jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger trg_product_variants_set_updated_at
  before update on public.product_variants
  for each row execute function public.set_updated_at();

-- Natural-key uniqueness is a unique INDEX, not a table constraint, because
-- color is nullable and `null <> null` in a unique constraint would silently
-- allow the same variant to insert twice. coalesce(color, '') closes that.
create unique index product_variants_natural_key
  on public.product_variants (product_id, capacity, coalesce(color, ''), carrier, lock_status, grade);

comment on index public.product_variants_natural_key is
  'Variant natural key per PRODUCT-CATALOG-STANDARD.md: (product, capacity, color, carrier, lock_status, grade). Uses coalesce(color, '''') because color is nullable (vendor feed uses * for unknown) and a null color would otherwise defeat a plain unique constraint, letting the same variant insert twice.';

create index product_variants_product_id_idx on public.product_variants (product_id);
-- No separate index on sku: the `unique` constraint above already provides one.

comment on column public.product_variants.grade is
  'Vendor grade label, stored VERBATIM including +/- suffix (e.g. "DLS B+"). Never trim the suffix — see PRODUCT-CATALOG-STANDARD.md §3.';

comment on column public.product_variants.sku is
  'Deterministic SKU supplied by the import writer (Phase 2, PRODUCT-CATALOG-STANDARD.md §6). NOT computed in the database — no generator function exists here by design.';

------------------------------------------------------------------
-- D. RLS — both tables, this same migration (D15, no exceptions)
------------------------------------------------------------------
alter table public.products         enable row level security;
alter table public.product_variants enable row level security;

create policy "products staff read" on public.products
  for select to authenticated
  using ( (select public.is_admin_or_staff()) );

create policy "products staff write" on public.products
  for all to authenticated
  using ( (select public.is_admin_or_staff()) )
  with check ( (select public.is_admin_or_staff()) );

create policy "product_variants staff read" on public.product_variants
  for select to authenticated
  using ( (select public.is_admin_or_staff()) );

create policy "product_variants staff write" on public.product_variants
  for all to authenticated
  using ( (select public.is_admin_or_staff()) )
  with check ( (select public.is_admin_or_staff()) );

-- No customer policy on either base table. Customers read the catalog
-- through the masking views created in plan 01-07 — product_variants.grade
-- carries the raw vendor label ("DLS B+"), which CTLG-01 classifies as
-- admin-side only, so exposing the base table directly would leak it.
