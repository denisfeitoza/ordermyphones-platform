-- 20260913150100_fulfilment.sql
-- J2 steps 4–5 of the v1.0 plan: after approval the operator prints a picking
-- sheet (client-side, from the approved lines + deducted locations) and marks
-- the order SHIPPED with a manual carrier + tracking number. Billing stays
-- off-system (DECISIONS-LOCKED #4/#8). Requires 20260913150000 (enum value).

alter table public.orders
  add column if not exists shipped_at       timestamptz,
  add column if not exists shipped_by       uuid references public.profiles(id),
  add column if not exists tracking_carrier text,
  add column if not exists tracking_number  text;

comment on column public.orders.tracking_carrier is 'Manual carrier label typed by staff at ship time (UPS, FedEx, USPS, DHL, Other…). No carrier API in v1.';
comment on column public.orders.tracking_number  is 'Manual tracking number typed by staff at ship time; shown to the customer in the portal.';

create index if not exists orders_shipped_by_idx on public.orders (shipped_by);

-- mark_order_shipped: staff/admin, only from approved / partially_approved.
-- Writes the order columns, one order_events row (kind 'shipped', visible to
-- the customer through the existing RLS) and an audit_log row.
create or replace function public.mark_order_shipped(
  p_order_id uuid,
  p_carrier  text default null,
  p_tracking text default null,
  p_note     text default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_role  text;
  v_order public.orders;
begin
  if not (select public.is_admin_or_staff()) then
    raise exception 'staff_only' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  if v_order.status not in ('approved'::public.order_status, 'partially_approved'::public.order_status) then
    raise exception 'order_not_approved' using errcode = 'P0001', detail = v_order.status::text;
  end if;

  select role::text into v_role from public.profiles where id = v_uid;

  update public.orders
     set status           = 'shipped'::public.order_status,
         shipped_at       = now(),
         shipped_by       = v_uid,
         tracking_carrier = nullif(btrim(p_carrier), ''),
         tracking_number  = nullif(btrim(p_tracking), ''),
         updated_at       = now()
   where id = p_order_id
  returning * into v_order;

  insert into public.order_events (order_id, actor_id, actor_role, kind, summary, changes)
  values (p_order_id, v_uid, coalesce(v_role, 'staff'), 'shipped', nullif(btrim(p_note), ''),
          jsonb_build_array(jsonb_build_object(
            'type', 'shipped',
            'label', 'Shipped',
            'carrier', v_order.tracking_carrier,
            'tracking', v_order.tracking_number)));

  insert into public.audit_log (actor_id, action, entity_type, entity_id, payload)
  values (v_uid, 'order_shipped', 'orders', p_order_id,
          jsonb_build_object('carrier', v_order.tracking_carrier, 'tracking', v_order.tracking_number,
                             'note', nullif(btrim(p_note), '')));

  return v_order;
end;
$$;

revoke execute on function public.mark_order_shipped(uuid, text, text, text) from public, anon;
grant  execute on function public.mark_order_shipped(uuid, text, text, text) to authenticated;

-- catalog_listing.sold_qty must keep counting an order after it ships
-- (otherwise "Best selling" forgets every fulfilled order). Same view as
-- 20260808160000 with 'shipped' added to the status predicate.
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
            pv.created_at
           FROM product_variants pv
             JOIN products p ON p.id = pv.product_id
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
         AND o.status IN ('approved'::order_status, 'partially_approved'::order_status, 'shipped'::order_status) ) AS sold_qty
   FROM base b
     JOIN inventory inv ON inv.variant_id = b.variant_id AND inv.qty > 0
     JOIN stock_locations sl ON sl.id = inv.location_id AND sl.active
  GROUP BY b.variant_id, b.sku, b.make, b.model, b.capacity, b.color, b.carrier, b.lock_status, b.ctia_grade, b.created_at;
