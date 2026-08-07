-- 20260807240000_catalog_listing_location_id.sql
-- M2-P3 UI needs the stock location's id (not just its display_name) so the
-- cart's per-location picker can send a location_id to place_order. Add `id`
-- to each object in catalog_listing.locations: {id, name, qty}. A location id
-- is an opaque uuid (no business/cost/supplier info), safe for the customer
-- read path. Only the locations jsonb shape changes; the view's column list is
-- unchanged, so `create or replace view` succeeds.
create or replace view public.catalog_listing as
with base as (
  select
    pv.id       as variant_id,
    pv.sku,
    p.make,
    p.model,
    pv.capacity,
    pv.color,
    pv.carrier,
    pv.lock_status,
    coalesce(g.ctia, 'C'::public.ctia_grade) as ctia_grade
  from public.product_variants pv
  join public.products p on p.id = pv.product_id
  left join lateral (
    select vgm.ctia
    from public.vendor_grade_map vgm
    where upper(trim(vgm.vendor_grade)) = upper(trim(pv.grade))
    order by vgm.ctia desc
    limit 1
  ) g on true
  where exists (
    select 1 from public.prices pr
    where pr.variant_id = pv.id and pr.visible
  )
)
select
  b.variant_id,
  b.sku,
  b.make,
  b.model,
  b.capacity,
  b.color,
  b.carrier,
  b.lock_status,
  b.ctia_grade,
  case b.ctia_grade
    when 'NEW' then 'New'
    when 'CPO' then 'Certified Pre-Owned'
    when 'A'   then 'Certified Pre-Owned · Grade A'
    when 'B'   then 'Grade B'
    when 'C'   then 'Grade C'
    when 'D'   then 'Grade D'
  end as ctia_label,
  sum(inv.qty)::integer as total_qty,
  jsonb_agg(
    jsonb_build_object('id', sl.id, 'name', sl.display_name, 'qty', inv.qty)
    order by sl.display_name
  ) as locations
from base b
join public.inventory inv        on inv.variant_id = b.variant_id and inv.qty > 0
join public.stock_locations sl   on sl.id = inv.location_id and sl.active
group by
  b.variant_id, b.sku, b.make, b.model, b.capacity, b.color, b.carrier,
  b.lock_status, b.ctia_grade;

comment on view public.catalog_listing is
  'Customer-safe catalog read path. One row per PUBLISHED (visible price at some tier), in-stock variant. Per-location breakdown is {id, name, qty} (M2-P3: id added for the cart picker). NEVER exposes unit_cost_cents, carrier_raw, grade, or supplier identity; price is read from public.variant_price_for_me. Intentionally NOT security_invoker.';
