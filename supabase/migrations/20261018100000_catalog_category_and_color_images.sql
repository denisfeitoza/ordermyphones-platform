-- M2-P5 (per-colour images) + category facet.
--
-- A. import_synonyms gains kind='color_value': raw supplier colour → canonical
--    colour key ("al midnight" → "midnight"). Same fold mechanism as carrier_value.
-- B. public.color_key(text): lower/trim/grey→gray, then the synonym fold.
-- C. product_color_images: one staff photo per (product, colour key). A photo
--    lives on the colour, not on every variant, so every capacity/carrier/grade
--    of "iPhone 15 · Blue" shares it.
-- D. catalog_listing APPENDS category + color_image_url (create or replace view
--    can only add trailing columns; existing order kept exactly). Masking
--    invariant unchanged: no cost, no raw grade, no carrier_raw, no supplier.

------------------------------------------------------------------
-- A. colour synonyms
------------------------------------------------------------------
alter table public.import_synonyms drop constraint if exists import_synonyms_kind_check;
alter table public.import_synonyms
  add constraint import_synonyms_kind_check check (kind in ('header', 'carrier_value', 'model_value', 'color_value'));

insert into public.import_synonyms (canonical_field, synonym, kind, maps_to) values
  ('color', 'al midnight',          'color_value', 'midnight'),
  ('color', 'al starlight',         'color_value', 'starlight'),
  ('color', 'titanium black',       'color_value', 'black titanium'),
  ('color', 'titanium gray',        'color_value', 'gray titanium'),
  ('color', 'titanium icyblue',     'color_value', 'titanium icy blue'),
  ('color', 'nat titanium',         'color_value', 'natural titanium'),
  ('color', 'natural ti',           'color_value', 'natural titanium')
on conflict (canonical_field, synonym, kind) do update set maps_to = excluded.maps_to;

------------------------------------------------------------------
-- B. colour key
------------------------------------------------------------------
create or replace function public.color_key(p_color text)
returns text
language sql
stable
set search_path = public
as $$
  with base as (
    select nullif(regexp_replace(replace(lower(trim(coalesce(p_color, ''))), 'grey', 'gray'), '\s+', ' ', 'g'), '') as k
  )
  select case
    -- vendor "no colour" markers ("*", "-") carry no letters
    when b.k is null or b.k !~ '[a-z]' then null
    else coalesce(
      (select s.maps_to from public.import_synonyms s
        where s.kind = 'color_value' and s.canonical_field = 'color' and s.synonym = b.k
        limit 1),
      b.k)
  end
  from base b
$$;

comment on function public.color_key(text) is
  'Canonical colour key: lower/trim, grey→gray, collapsed spaces, then the import_synonyms color_value fold. NULL for "no colour" markers.';

------------------------------------------------------------------
-- C. per-colour photos
------------------------------------------------------------------
create table if not exists public.product_color_images (
  product_id  uuid not null references public.products(id) on delete cascade,
  color_key   text not null check (length(color_key) between 1 and 60),
  image_url   text not null check (image_url ~ '^https://' and length(image_url) <= 1000),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null default auth.uid(),
  primary key (product_id, color_key)
);

comment on table public.product_color_images is
  'Staff photo per (product, colour key). Wins over products.image_url in catalog_listing.color_image_url. Customers read it only through catalog_listing.';

alter table public.product_color_images enable row level security;

create policy "product_color_images staff read" on public.product_color_images
  for select to authenticated using ( (select public.is_admin_or_staff()) );
create policy "product_color_images staff insert" on public.product_color_images
  for insert to authenticated with check ( (select public.is_admin_or_staff()) );
create policy "product_color_images staff update" on public.product_color_images
  for update to authenticated
  using ( (select public.is_admin_or_staff()) ) with check ( (select public.is_admin_or_staff()) );
create policy "product_color_images staff delete" on public.product_color_images
  for delete to authenticated using ( (select public.is_admin_or_staff()) );

revoke all on public.product_color_images from anon;
grant select, insert, update, delete on public.product_color_images to authenticated;

------------------------------------------------------------------
-- D. catalog_listing: + category, + color_image_url (appended)
------------------------------------------------------------------
create or replace view public.catalog_listing as
 WITH base AS (
         SELECT pv.id AS variant_id,
            pv.sku,
            p.make,
            p.model,
            pv.capacity,
            pv.color,
            pv.carrier,
            pv.lock_status,
            COALESCE(g.ctia, 'C'::ctia_grade) AS ctia_grade,
            pv.created_at,
            p.image_url,
            p.description,
            p.category,
            ci.image_url AS color_image_url
           FROM product_variants pv
             JOIN products p ON p.id = pv.product_id AND p.published
             LEFT JOIN LATERAL ( SELECT vgm.ctia
                   FROM vendor_grade_map vgm
                  WHERE upper(TRIM(BOTH FROM vgm.vendor_grade)) = upper(TRIM(BOTH FROM pv.grade))
                  ORDER BY vgm.ctia DESC
                 LIMIT 1) g ON true
             LEFT JOIN product_color_images ci ON ci.product_id = p.id AND ci.color_key = public.color_key(pv.color)
          WHERE (EXISTS ( SELECT 1
                   FROM prices pr
                  WHERE pr.variant_id = pv.id AND pr.visible))
        )
 SELECT b.variant_id,
    b.sku,
    b.make,
    b.model,
    b.capacity,
    b.color,
    b.carrier,
    b.lock_status,
    b.ctia_grade,
        CASE b.ctia_grade
            WHEN 'NEW'::ctia_grade THEN 'New'::text
            WHEN 'CPO'::ctia_grade THEN 'Certified Pre-Owned'::text
            WHEN 'A'::ctia_grade THEN 'Certified Pre-Owned · Grade A'::text
            WHEN 'B'::ctia_grade THEN 'Grade B'::text
            WHEN 'C'::ctia_grade THEN 'Grade C'::text
            WHEN 'D'::ctia_grade THEN 'Grade D'::text
            ELSE NULL::text
        END AS ctia_label,
    sum(inv.qty)::integer AS total_qty,
    jsonb_agg(jsonb_build_object('id', sl.id, 'name', sl.display_name, 'qty', inv.qty) ORDER BY sl.display_name) AS locations,
    b.created_at,
    ( SELECT COALESCE(sum(oi.qty_approved), 0)::integer
        FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
       WHERE oi.variant_id = b.variant_id
         AND o.status IN ('approved'::order_status, 'partially_approved'::order_status, 'shipped'::order_status) ) AS sold_qty,
    b.image_url,
    b.description,
    b.category,
    b.color_image_url
   FROM base b
     JOIN inventory inv ON inv.variant_id = b.variant_id AND inv.qty > 0
     JOIN stock_locations sl ON sl.id = inv.location_id AND sl.active
  GROUP BY b.variant_id, b.sku, b.make, b.model, b.capacity, b.color, b.carrier, b.lock_status, b.ctia_grade, b.created_at,
           b.image_url, b.description, b.category, b.color_image_url;

-- The view aggregates (GROUP BY), so it was never writable; drop the default
-- write grants anyway so the grant list says what the view is: read-only.
revoke insert, update, delete, truncate, references, trigger on public.catalog_listing from anon, authenticated;
