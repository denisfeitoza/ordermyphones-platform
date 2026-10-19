-- Image bank: every product image is a reusable asset with the model keys it
-- represents. The 86 studio renders shipped in /generated/catalog are the
-- first assets; staff uploads join them. New products (manual or import) get
-- an exact-match image automatically; anything else is a suggestion staff
-- confirm in the admin. AI generation is out of scope for now.

create extension if not exists pg_trgm with schema extensions;

create or replace function public.omp_model_key(p_model text)
returns text
language sql
immutable
parallel safe
set search_path to ''
as $$
  -- Postgres port of normalizeModel() in apps/web/src/lib/productImage.ts and
  -- tooling/image-gen/catalog-manifest.mjs. \y is the word boundary (\b in JS).
  select btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(replace(lower(coalesce(p_model, '')), '+', ' plus '), '\yfan edition\y', 'fe', 'g'),
          '\y5g\y', '', 'g'),
        '\y(fold|flip)\s+(\d)\y', '\1\2', 'g'),
      '\s+', ' ', 'g'))
$$;

-- "iphone 15 pro max" -> "iphone 15"; "galaxy s24 ultra" -> "galaxy s24".
create or replace function public.omp_family_key(p_key text)
returns text
language sql
immutable
parallel safe
set search_path to ''
as $$
  select btrim(regexp_replace(
    regexp_replace(coalesce(p_key, ''), '\y(pro|max|plus|ultra|mini|fe|edge|xl|lite|slim|air)\y', '', 'g'),
    '\s+', ' ', 'g'))
$$;

create table public.image_assets (
  id           uuid primary key default gen_random_uuid(),
  url          text not null check (url ~ '^(https://|/generated/catalog/)' and length(url) <= 1000),
  storage_path text unique,
  kind         text not null check (kind in ('render', 'upload')),
  make         text,
  model_keys   text[] not null default '{}',
  color_key    text,
  sha256       text unique,
  width        integer,
  height       integer,
  label        text,
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now()
);
create index image_assets_model_keys_idx on public.image_assets using gin (model_keys);

alter table public.image_assets enable row level security;
create policy image_assets_staff_read on public.image_assets
  for select to authenticated using ((select public.is_admin_or_staff()));
create policy image_assets_staff_insert on public.image_assets
  for insert to authenticated with check ((select public.is_admin_or_staff()));
create policy image_assets_staff_update on public.image_assets
  for update to authenticated using ((select public.is_admin_or_staff())) with check ((select public.is_admin_or_staff()));
create policy image_assets_staff_delete on public.image_assets
  for delete to authenticated using ((select public.is_admin_or_staff()));
revoke all on public.image_assets from anon;

insert into public.image_assets (url, kind, make, model_keys, label) values
  ('/generated/catalog/airpods-max.webp', 'render', 'Apple', array['airpods max 2 usb-c', 'airpods max usb-c']::text[], 'airpods-max'),
  ('/generated/catalog/galaxy-note20.webp', 'render', 'Samsung', array['galaxy note20']::text[], 'galaxy-note20'),
  ('/generated/catalog/galaxy-note20-ultra.webp', 'render', 'Samsung', array['galaxy note20 ultra']::text[], 'galaxy-note20-ultra'),
  ('/generated/catalog/galaxy-s21.webp', 'render', 'Samsung', array['galaxy s21']::text[], 'galaxy-s21'),
  ('/generated/catalog/galaxy-s21-fe.webp', 'render', 'Samsung', array['galaxy s21 fe']::text[], 'galaxy-s21-fe'),
  ('/generated/catalog/galaxy-s21-plus.webp', 'render', 'Samsung', array['galaxy s21 plus']::text[], 'galaxy-s21-plus'),
  ('/generated/catalog/galaxy-s21-ultra.webp', 'render', 'Samsung', array['galaxy s21 ultra']::text[], 'galaxy-s21-ultra'),
  ('/generated/catalog/galaxy-s22.webp', 'render', 'Samsung', array['galaxy s22']::text[], 'galaxy-s22'),
  ('/generated/catalog/galaxy-s22-plus.webp', 'render', 'Samsung', array['galaxy s22 plus']::text[], 'galaxy-s22-plus'),
  ('/generated/catalog/galaxy-s22-ultra.webp', 'render', 'Samsung', array['galaxy s22 ultra']::text[], 'galaxy-s22-ultra'),
  ('/generated/catalog/galaxy-s23.webp', 'render', 'Samsung', array['galaxy s23']::text[], 'galaxy-s23'),
  ('/generated/catalog/galaxy-s23-fe.webp', 'render', 'Samsung', array['galaxy s23 fe']::text[], 'galaxy-s23-fe'),
  ('/generated/catalog/galaxy-s23-plus.webp', 'render', 'Samsung', array['galaxy s23 plus']::text[], 'galaxy-s23-plus'),
  ('/generated/catalog/galaxy-s23-ultra.webp', 'render', 'Samsung', array['galaxy s23 ultra']::text[], 'galaxy-s23-ultra'),
  ('/generated/catalog/galaxy-s24.webp', 'render', 'Samsung', array['galaxy s24']::text[], 'galaxy-s24'),
  ('/generated/catalog/galaxy-s24-fe.webp', 'render', 'Samsung', array['galaxy s24 fe']::text[], 'galaxy-s24-fe'),
  ('/generated/catalog/galaxy-s24-plus.webp', 'render', 'Samsung', array['galaxy s24 plus']::text[], 'galaxy-s24-plus'),
  ('/generated/catalog/galaxy-s24-ultra.webp', 'render', 'Samsung', array['galaxy s24 ultra']::text[], 'galaxy-s24-ultra'),
  ('/generated/catalog/galaxy-s25.webp', 'render', 'Samsung', array['galaxy s25']::text[], 'galaxy-s25'),
  ('/generated/catalog/galaxy-s25-edge.webp', 'render', 'Samsung', array['galaxy s25 edge']::text[], 'galaxy-s25-edge'),
  ('/generated/catalog/galaxy-s25-fe.webp', 'render', 'Samsung', array['galaxy s25 fe']::text[], 'galaxy-s25-fe'),
  ('/generated/catalog/galaxy-s25-plus.webp', 'render', 'Samsung', array['galaxy s25 plus']::text[], 'galaxy-s25-plus'),
  ('/generated/catalog/galaxy-s25-ultra.webp', 'render', 'Samsung', array['galaxy s25 ultra']::text[], 'galaxy-s25-ultra'),
  ('/generated/catalog/galaxy-s26.webp', 'render', 'Samsung', array['galaxy s26']::text[], 'galaxy-s26'),
  ('/generated/catalog/galaxy-s26-plus.webp', 'render', 'Samsung', array['galaxy s26 plus']::text[], 'galaxy-s26-plus'),
  ('/generated/catalog/galaxy-s26-ultra.webp', 'render', 'Samsung', array['galaxy s26 ultra']::text[], 'galaxy-s26-ultra'),
  ('/generated/catalog/galaxy-z-flip3.webp', 'render', 'Samsung', array['galaxy z flip3']::text[], 'galaxy-z-flip3'),
  ('/generated/catalog/galaxy-z-flip4.webp', 'render', 'Samsung', array['galaxy z flip4']::text[], 'galaxy-z-flip4'),
  ('/generated/catalog/galaxy-z-flip5.webp', 'render', 'Samsung', array['galaxy z flip5']::text[], 'galaxy-z-flip5'),
  ('/generated/catalog/galaxy-z-flip6.webp', 'render', 'Samsung', array['galaxy z flip6']::text[], 'galaxy-z-flip6'),
  ('/generated/catalog/galaxy-z-flip7.webp', 'render', 'Samsung', array['galaxy z flip7']::text[], 'galaxy-z-flip7'),
  ('/generated/catalog/galaxy-z-fold3.webp', 'render', 'Samsung', array['galaxy z fold3']::text[], 'galaxy-z-fold3'),
  ('/generated/catalog/galaxy-z-fold4.webp', 'render', 'Samsung', array['galaxy z fold4']::text[], 'galaxy-z-fold4'),
  ('/generated/catalog/galaxy-z-fold5.webp', 'render', 'Samsung', array['galaxy z fold5']::text[], 'galaxy-z-fold5'),
  ('/generated/catalog/galaxy-z-fold6.webp', 'render', 'Samsung', array['galaxy z fold6']::text[], 'galaxy-z-fold6'),
  ('/generated/catalog/galaxy-z-fold7.webp', 'render', 'Samsung', array['galaxy z fold7']::text[], 'galaxy-z-fold7'),
  ('/generated/catalog/iphone-11.webp', 'render', 'Apple', array['iphone 11']::text[], 'iphone-11'),
  ('/generated/catalog/iphone-11-pro.webp', 'render', 'Apple', array['iphone 11 pro']::text[], 'iphone-11-pro'),
  ('/generated/catalog/iphone-11-pro-max.webp', 'render', 'Apple', array['iphone 11 pro max']::text[], 'iphone-11-pro-max'),
  ('/generated/catalog/iphone-12.webp', 'render', 'Apple', array['iphone 12']::text[], 'iphone-12'),
  ('/generated/catalog/iphone-12-mini.webp', 'render', 'Apple', array['iphone 12 mini']::text[], 'iphone-12-mini'),
  ('/generated/catalog/iphone-12-pro.webp', 'render', 'Apple', array['iphone 12 pro']::text[], 'iphone-12-pro'),
  ('/generated/catalog/iphone-12-pro-max.webp', 'render', 'Apple', array['iphone 12 pro max']::text[], 'iphone-12-pro-max'),
  ('/generated/catalog/iphone-13.webp', 'render', 'Apple', array['iphone 13']::text[], 'iphone-13'),
  ('/generated/catalog/iphone-13-mini.webp', 'render', 'Apple', array['iphone 13 mini']::text[], 'iphone-13-mini'),
  ('/generated/catalog/iphone-13-pro.webp', 'render', 'Apple', array['iphone 13 pro']::text[], 'iphone-13-pro'),
  ('/generated/catalog/iphone-13-pro-max.webp', 'render', 'Apple', array['iphone 13 pro max']::text[], 'iphone-13-pro-max'),
  ('/generated/catalog/iphone-14.webp', 'render', 'Apple', array['iphone 14']::text[], 'iphone-14'),
  ('/generated/catalog/iphone-14-plus.webp', 'render', 'Apple', array['iphone 14 plus']::text[], 'iphone-14-plus'),
  ('/generated/catalog/iphone-14-pro.webp', 'render', 'Apple', array['iphone 14 pro']::text[], 'iphone-14-pro'),
  ('/generated/catalog/iphone-14-pro-max.webp', 'render', 'Apple', array['iphone 14 pro max']::text[], 'iphone-14-pro-max'),
  ('/generated/catalog/iphone-15.webp', 'render', 'Apple', array['iphone 15']::text[], 'iphone-15'),
  ('/generated/catalog/iphone-15-plus.webp', 'render', 'Apple', array['iphone 15 plus']::text[], 'iphone-15-plus'),
  ('/generated/catalog/iphone-15-pro.webp', 'render', 'Apple', array['iphone 15 pro']::text[], 'iphone-15-pro'),
  ('/generated/catalog/iphone-15-pro-max.webp', 'render', 'Apple', array['iphone 15 pro max']::text[], 'iphone-15-pro-max'),
  ('/generated/catalog/iphone-16.webp', 'render', 'Apple', array['iphone 16']::text[], 'iphone-16'),
  ('/generated/catalog/iphone-16-plus.webp', 'render', 'Apple', array['iphone 16 plus']::text[], 'iphone-16-plus'),
  ('/generated/catalog/iphone-16-pro.webp', 'render', 'Apple', array['iphone 16 pro']::text[], 'iphone-16-pro'),
  ('/generated/catalog/iphone-16-pro-max.webp', 'render', 'Apple', array['iphone 16 pro max']::text[], 'iphone-16-pro-max'),
  ('/generated/catalog/iphone-16e.webp', 'render', 'Apple', array['iphone 16e']::text[], 'iphone-16e'),
  ('/generated/catalog/iphone-17.webp', 'render', 'Apple', array['iphone 17']::text[], 'iphone-17'),
  ('/generated/catalog/iphone-17-pro.webp', 'render', 'Apple', array['iphone 17 pro']::text[], 'iphone-17-pro'),
  ('/generated/catalog/iphone-17-pro-max.webp', 'render', 'Apple', array['iphone 17 pro max']::text[], 'iphone-17-pro-max'),
  ('/generated/catalog/iphone-17e.webp', 'render', 'Apple', array['iphone 17e']::text[], 'iphone-17e'),
  ('/generated/catalog/iphone-air.webp', 'render', 'Apple', array['iphone air']::text[], 'iphone-air'),
  ('/generated/catalog/iphone-se-3.webp', 'render', 'Apple', array['iphone se 3']::text[], 'iphone-se-3'),
  ('/generated/catalog/iphone-xr.webp', 'render', 'Apple', array['iphone xr']::text[], 'iphone-xr'),
  ('/generated/catalog/pixel-10.webp', 'render', 'Google', array['pixel 10']::text[], 'pixel-10'),
  ('/generated/catalog/pixel-10-pro.webp', 'render', 'Google', array['pixel 10 pro']::text[], 'pixel-10-pro'),
  ('/generated/catalog/pixel-10-pro-fold.webp', 'render', 'Google', array['pixel 10 pro fold']::text[], 'pixel-10-pro-fold'),
  ('/generated/catalog/pixel-10-pro-xl.webp', 'render', 'Google', array['pixel 10 pro xl']::text[], 'pixel-10-pro-xl'),
  ('/generated/catalog/pixel-10a.webp', 'render', 'Google', array['pixel 10a']::text[], 'pixel-10a'),
  ('/generated/catalog/pixel-2-xl.webp', 'render', 'Google', array['pixel 2 xl']::text[], 'pixel-2-xl'),
  ('/generated/catalog/pixel-6-pro.webp', 'render', 'Google', array['pixel 6 pro']::text[], 'pixel-6-pro'),
  ('/generated/catalog/pixel-7.webp', 'render', 'Google', array['pixel 7']::text[], 'pixel-7'),
  ('/generated/catalog/pixel-7-pro.webp', 'render', 'Google', array['pixel 7 pro']::text[], 'pixel-7-pro'),
  ('/generated/catalog/pixel-8.webp', 'render', 'Google', array['pixel 8']::text[], 'pixel-8'),
  ('/generated/catalog/pixel-8-pro.webp', 'render', 'Google', array['pixel 8 pro']::text[], 'pixel-8-pro'),
  ('/generated/catalog/pixel-8a.webp', 'render', 'Google', array['pixel 8a']::text[], 'pixel-8a'),
  ('/generated/catalog/pixel-9.webp', 'render', 'Google', array['pixel 9']::text[], 'pixel-9'),
  ('/generated/catalog/pixel-9-pro.webp', 'render', 'Google', array['pixel 9 pro']::text[], 'pixel-9-pro'),
  ('/generated/catalog/pixel-9-pro-xl.webp', 'render', 'Google', array['pixel 9 pro xl']::text[], 'pixel-9-pro-xl'),
  ('/generated/catalog/pixel-9a.webp', 'render', 'Google', array['pixel 9a']::text[], 'pixel-9a'),
  ('/generated/catalog/pixel-fold.webp', 'render', 'Google', array['pixel fold']::text[], 'pixel-fold'),
  ('/generated/catalog/watch-se3-40-starlight.webp', 'render', 'Apple', array['watchse3 40 starlight band s']::text[], 'watch-se3-40-starlight'),
  ('/generated/catalog/watch-se3-44-midnight.webp', 'render', 'Apple', array['watchse3 44 black band m']::text[], 'watch-se3-44-midnight');

-- Which asset a product shows, and whether it is only an approximation
-- (another model of the family, chosen by staff) the store must label.
alter table public.products
  add column image_asset_id uuid references public.image_assets(id) on delete set null,
  add column image_approx boolean not null default false;

-- Best exact asset for a model: a staff upload beats a studio render.
create or replace function public.exact_image_asset(p_model text)
returns public.image_assets
language sql
stable
security definer
set search_path to ''
as $$
  select a.* from public.image_assets a
   where public.omp_model_key(p_model) = any(a.model_keys) and a.color_key is null
   order by (a.kind = 'upload') desc, a.created_at desc
   limit 1
$$;
revoke all on function public.exact_image_asset(text) from public, anon, authenticated;

-- New products (import or manual) get the exact-match image if they have none.
-- The import's ON CONFLICT DO UPDATE never touches image_url, so a staff
-- choice is never overwritten.
create or replace function public.products_auto_image()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare v public.image_assets;
begin
  if new.image_url is null then
    v := public.exact_image_asset(new.model);
    if v.id is not null then
      new.image_url := v.url;
      new.image_asset_id := v.id;
      new.image_approx := false;
    end if;
  end if;
  return new;
end;
$$;
create trigger trg_products_auto_image before insert on public.products
  for each row execute function public.products_auto_image();

-- Backfill: products with no image that match exactly, and link the products
-- already pointing at a render to its asset.
with m as (
  select p.id as product_id, a.id as asset_id, a.url
    from public.products p
   cross join lateral public.exact_image_asset(p.model) a
   where p.image_url is null and a.id is not null
)
update public.products p
   set image_url = m.url, image_asset_id = m.asset_id, image_approx = false
  from m
 where p.id = m.product_id;

update public.products p
   set image_asset_id = a.id
  from public.image_assets a
 where p.image_asset_id is null and p.image_url = a.url;
