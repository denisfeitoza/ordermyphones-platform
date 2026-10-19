-- Prices search: "Apple SE2" found nothing, because make and model were
-- matched one at a time. Also match the text "make model" as a whole.
-- Body otherwise unchanged from the live definition.
create or replace function public.variant_pricing_breakdown(p_query text default null::text)
returns table(variant_id uuid, sku text, make text, model text, capacity text, color text, lock_status public.lock_status, carrier public.carrier_code, ctia_grade public.ctia_grade, total_qty integer, locations jsonb, min_cost bigint, max_cost bigint, avg_cost bigint, price_consumer bigint, price_retailer bigint, price_wholesale bigint, price_distributor bigint)
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not public.is_admin_or_staff() then
    raise exception 'staff_only' using errcode = '42501';
  end if;
  return query
  select pv.id, pv.sku, p.make, p.model, pv.capacity, pv.color,
         pv.lock_status, pv.carrier,
         coalesce(g.ctia, 'C'::public.ctia_grade),
         sum(inv.qty)::integer,
         jsonb_agg(jsonb_build_object('name', sl.display_name, 'qty', inv.qty, 'cost_cents', inv.unit_cost_cents)
                   order by inv.unit_cost_cents desc nulls last),
         min(inv.unit_cost_cents), max(inv.unit_cost_cents), round(avg(inv.unit_cost_cents))::bigint,
         (select pr.price_cents from public.prices pr where pr.variant_id = pv.id and pr.tier = 'consumer'    and pr.visible),
         (select pr.price_cents from public.prices pr where pr.variant_id = pv.id and pr.tier = 'retailer'    and pr.visible),
         (select pr.price_cents from public.prices pr where pr.variant_id = pv.id and pr.tier = 'wholesale'   and pr.visible),
         (select pr.price_cents from public.prices pr where pr.variant_id = pv.id and pr.tier = 'distributor' and pr.visible)
  from public.product_variants pv
  join public.products p on p.id = pv.product_id
  join public.inventory inv on inv.variant_id = pv.id and inv.qty > 0
  join public.stock_locations sl on sl.id = inv.location_id and sl.active
  left join lateral (
    select vgm.ctia from public.vendor_grade_map vgm
    where upper(trim(vgm.vendor_grade)) = upper(trim(pv.grade))
    order by vgm.ctia desc limit 1
  ) g on true
  where p_query is null or btrim(p_query) = ''
     or p.model ilike '%' || btrim(p_query) || '%'
     or p.make  ilike '%' || btrim(p_query) || '%'
     or (p.make || ' ' || p.model) ilike '%' || btrim(p_query) || '%'
     or pv.sku  ilike '%' || btrim(p_query) || '%'
  group by pv.id, pv.sku, p.make, p.model, pv.capacity, pv.color, pv.lock_status, pv.carrier, g.ctia
  order by p.make, p.model, pv.capacity, pv.color
  limit 300;
end $function$;
