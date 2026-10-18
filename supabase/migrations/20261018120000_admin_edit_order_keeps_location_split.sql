-- Audit 2026-09-13 P2: editing a pending order collapsed split-location lines.
--
-- With app_settings.order_location_selection ON (production), a customer can
-- order "3 from Miami + 2 from Dallas" of one variant: two order_items rows
-- that differ only in requested_location_id. admin_edit_order grouped by
-- variant, so a save merged them into one row and kept a single location.
--
-- Now a line is keyed by (variant_id, requested_location_id):
--   * each item may carry "requested_location_id" (uuid or null);
--   * an item WITHOUT that key (an older client) keeps the variant's current
--     location, exactly as before, so nothing breaks mid-deploy;
--   * a non-null location must exist and be active;
--   * the change log names the warehouse when a line is bound to one.
-- Signature, grants, status gate and the audit trail are unchanged.

create or replace function public.admin_edit_order(
  p_order_id uuid,
  p_items jsonb,
  p_shipping_address jsonb default null,
  p_note text default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_role     text;
  v_order    public.orders;
  v_new_norm jsonb;
  v_old      jsonb;
  v_subtotal bigint := 0;
  v_changes  jsonb := '[]'::jsonb;
  v_name     text;
  rec        record;
begin
  if not public.is_admin_or_staff() then
    raise exception 'staff_only' using errcode = '42501';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty_order' using errcode = 'P0001';
  end if;

  select role::text into v_role from public.profiles where id = v_uid;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  if v_order.status <> 'pending' then
    raise exception 'order_not_pending' using errcode = 'P0001', detail = v_order.status::text;
  end if;

  -- New lines, one per (variant, location). Missing key => legacy client:
  -- inherit the variant's current location.
  select coalesce(jsonb_agg(jsonb_build_object(
           'variant_id', variant_id,
           'location_id', location_id,
           'qty', qty,
           'unit_price_cents', unit_price_cents
         )), '[]'::jsonb)
    into v_new_norm
  from (
    select x.variant_id,
           x.location_id,
           sum(x.qty)::int                as qty,
           max(x.unit_price_cents)        as unit_price_cents
    from (
      select (e->>'variant_id')::uuid as variant_id,
             case when e ? 'requested_location_id'
                  then nullif(e->>'requested_location_id', '')::uuid
                  else (select max(oi.requested_location_id::text)::uuid
                          from public.order_items oi
                         where oi.order_id = p_order_id
                           and oi.variant_id = (e->>'variant_id')::uuid)
             end                            as location_id,
             (e->>'qty')::int               as qty,
             (e->>'unit_price_cents')::bigint as unit_price_cents
      from jsonb_array_elements(p_items) e
    ) x
    group by x.variant_id, x.location_id
  ) agg;

  if exists (
    select 1 from jsonb_to_recordset(v_new_norm) as n(variant_id uuid, location_id uuid, qty int, unit_price_cents bigint)
    where n.variant_id is null
  ) then
    raise exception 'bad_variant' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(v_new_norm) as n(variant_id uuid, location_id uuid, qty int, unit_price_cents bigint)
    where n.qty is null or n.qty <= 0
  ) then
    raise exception 'bad_qty' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(v_new_norm) as n(variant_id uuid, location_id uuid, qty int, unit_price_cents bigint)
    where n.unit_price_cents is null or n.unit_price_cents <= 0
  ) then
    raise exception 'bad_price' using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(v_new_norm) as n(variant_id uuid, location_id uuid, qty int, unit_price_cents bigint)
    left join public.product_variants pv on pv.id = n.variant_id
    where pv.id is null
  ) then
    raise exception 'unknown_variant' using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(v_new_norm) as n(variant_id uuid, location_id uuid, qty int, unit_price_cents bigint)
    left join public.stock_locations sl on sl.id = n.location_id
    where n.location_id is not null and (sl.id is null or not sl.active)
  ) then
    raise exception 'bad_location' using errcode = 'P0001';
  end if;

  -- Current lines, same key.
  select coalesce(jsonb_agg(jsonb_build_object(
           'variant_id', variant_id,
           'location_id', location_id,
           'qty', qty,
           'unit_price_cents', unit_price_cents
         )), '[]'::jsonb)
    into v_old
  from (
    select variant_id,
           requested_location_id           as location_id,
           sum(qty_requested)::int         as qty,
           max(unit_price_cents)           as unit_price_cents
    from public.order_items
    where order_id = p_order_id
    group by variant_id, requested_location_id
  ) s;

  select coalesce(sum(n.qty * n.unit_price_cents), 0)
    into v_subtotal
  from jsonb_to_recordset(v_new_norm) as n(variant_id uuid, location_id uuid, qty int, unit_price_cents bigint);

  for rec in
    select coalesce(o.variant_id, n.variant_id) as variant_id,
           o.qty as old_qty, o.unit_price_cents as old_price,
           n.qty as new_qty, n.unit_price_cents as new_price,
           pr.model, pv.capacity, pv.sku, sl.display_name as location_name
    from jsonb_to_recordset(v_old) as o(variant_id uuid, location_id uuid, qty int, unit_price_cents bigint)
    full outer join jsonb_to_recordset(v_new_norm) as n(variant_id uuid, location_id uuid, qty int, unit_price_cents bigint)
      on n.variant_id = o.variant_id and n.location_id is not distinct from o.location_id
    left join public.product_variants pv on pv.id = coalesce(o.variant_id, n.variant_id)
    left join public.products pr on pr.id = pv.product_id
    left join public.stock_locations sl on sl.id = coalesce(o.location_id, n.location_id)
  loop
    v_name := coalesce(rec.model, rec.sku, 'item')
              || case when rec.capacity is not null and rec.capacity <> '' then ' · ' || rec.capacity else '' end
              || case when rec.location_name is not null then ' · ' || rec.location_name else '' end;
    if rec.old_qty is null then
      v_changes := v_changes || jsonb_build_object(
        'type', 'added', 'label', v_name, 'qty', rec.new_qty, 'price', rec.new_price);
    elsif rec.new_qty is null then
      v_changes := v_changes || jsonb_build_object(
        'type', 'removed', 'label', v_name, 'qty', rec.old_qty);
    else
      if rec.old_qty <> rec.new_qty then
        v_changes := v_changes || jsonb_build_object(
          'type', 'qty', 'label', v_name, 'from', rec.old_qty, 'to', rec.new_qty);
      end if;
      if rec.old_price <> rec.new_price then
        v_changes := v_changes || jsonb_build_object(
          'type', 'price', 'label', v_name, 'from', rec.old_price, 'to', rec.new_price);
      end if;
    end if;
  end loop;

  if p_shipping_address is not null
     and p_shipping_address is distinct from v_order.shipping_address then
    v_changes := v_changes || jsonb_build_object('type', 'address', 'label', 'Shipping address');
  end if;
  if p_note is not null
     and nullif(btrim(p_note), '') is distinct from v_order.notes then
    v_changes := v_changes || jsonb_build_object('type', 'note', 'label', 'Order note');
  end if;

  delete from public.order_items where order_id = p_order_id;

  insert into public.order_items
    (order_id, variant_id, requested_location_id, qty_requested, unit_price_cents, tier)
  select p_order_id, n.variant_id, n.location_id, n.qty, n.unit_price_cents, v_order.tier_at_order
  from jsonb_to_recordset(v_new_norm) as n(variant_id uuid, location_id uuid, qty int, unit_price_cents bigint);

  update public.orders
     set subtotal_cents   = v_subtotal,
         shipping_address = coalesce(p_shipping_address, shipping_address),
         notes            = case when p_note is null then notes else nullif(btrim(p_note), '') end,
         updated_at       = now()
   where id = p_order_id;

  if jsonb_array_length(v_changes) > 0 then
    insert into public.order_events (order_id, actor_id, actor_role, kind, summary, changes)
    values (p_order_id, v_uid, coalesce(v_role, 'admin'), 'edited', nullif(btrim(p_reason), ''), v_changes);

    insert into public.audit_log (actor_id, action, entity_type, entity_id, payload)
    values (v_uid, 'order_edited', 'orders', p_order_id,
            jsonb_build_object('changes', v_changes, 'subtotal_cents', v_subtotal,
                               'reason', nullif(btrim(p_reason), '')));
  end if;

  return jsonb_build_object('order_id', p_order_id, 'subtotal_cents', v_subtotal, 'changes', v_changes);
end;
$$;

revoke all on function public.admin_edit_order(uuid, jsonb, jsonb, text, text) from public, anon;
grant execute on function public.admin_edit_order(uuid, jsonb, jsonb, text, text) to authenticated;
