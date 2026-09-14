-- 20260913160000_product_content.sql
-- S2 of the v1.0 plan: "CRUD de produto: criar/editar, fotos, descrição,
-- publicar". Products come from the import; this adds what the import can't
-- carry — a photo, a description and a publish switch — editable by staff in
-- Admin → Inventory → Products, and exposed to the storefront through
-- catalog_listing (unpublished products drop out of the listing entirely).

------------------------------------------------------------------
-- A. Columns
------------------------------------------------------------------
alter table public.products
  add column if not exists description text,
  add column if not exists image_url   text,
  add column if not exists published   boolean not null default true;

comment on column public.products.image_url is 'Public URL of the product photo in the product-photos bucket (staff upload). Null = storefront placeholder.';
comment on column public.products.published is 'False hides every variant of the product from catalog_listing (and so from the storefront) without touching stock or prices.';

------------------------------------------------------------------
-- B. Public photo bucket: anyone can view, staff/admin manage.
------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('product-photos', 'product-photos', true)
on conflict (id) do nothing;

drop policy if exists "product-photos public read" on storage.objects;
create policy "product-photos public read" on storage.objects
  for select to anon, authenticated
  using ( bucket_id = 'product-photos' );

drop policy if exists "product-photos staff insert" on storage.objects;
create policy "product-photos staff insert" on storage.objects
  for insert to authenticated
  with check ( bucket_id = 'product-photos' and (select public.is_admin_or_staff()) );

drop policy if exists "product-photos staff update" on storage.objects;
create policy "product-photos staff update" on storage.objects
  for update to authenticated
  using ( bucket_id = 'product-photos' and (select public.is_admin_or_staff()) )
  with check ( bucket_id = 'product-photos' and (select public.is_admin_or_staff()) );

drop policy if exists "product-photos staff delete" on storage.objects;
create policy "product-photos staff delete" on storage.objects
  for delete to authenticated
  using ( bucket_id = 'product-photos' and (select public.is_admin_or_staff()) );

------------------------------------------------------------------
-- C. catalog_listing: only published products; image_url + description
-- APPENDED at the end (create or replace view requirement).
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
            p.description
           FROM product_variants pv
             JOIN products p ON p.id = pv.product_id AND p.published
             LEFT JOIN LATERAL ( SELECT vgm.ctia
                   FROM vendor_grade_map vgm
                  WHERE upper(TRIM(BOTH FROM vgm.vendor_grade)) = upper(TRIM(BOTH FROM pv.grade))
                  ORDER BY vgm.ctia DESC
                 LIMIT 1) g ON true
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
    b.description
   FROM base b
     JOIN inventory inv ON inv.variant_id = b.variant_id AND inv.qty > 0
     JOIN stock_locations sl ON sl.id = inv.location_id AND sl.active
  GROUP BY b.variant_id, b.sku, b.make, b.model, b.capacity, b.color, b.carrier, b.lock_status, b.ctia_grade, b.created_at, b.image_url, b.description;
