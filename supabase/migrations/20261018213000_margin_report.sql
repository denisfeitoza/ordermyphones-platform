-- Margin report. Approval and reconciliation fulfil now snapshot the
-- location's unit cost on the order's stock movement (it was always null),
-- so margin uses the cost at the moment stock left, not today's cost.

create or replace function public.approve_order(p_order_id uuid, p_override_requirements boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  v_uid            uuid := auth.uid();
  v_order          public.orders;
  v_item           public.order_items;
  v_loc            record;
  v_remaining      integer;
  v_deducted_total integer;
  v_take           integer;
  v_primary_loc    uuid;
  v_recon_loc      uuid;
  v_any_short      boolean := false;
  v_approved_lines integer := 0;
  v_short_lines    integer := 0;
  v_recon_ids      uuid[] := '{}';
  v_recon_id       uuid;
  v_fmode          text;
  v_missing        text[];
begin
  if not public.is_admin_or_staff() then
    raise exception 'staff_only' using errcode = '42501';
  end if;

  select coalesce(value->>'mode', 'fallback') into v_fmode
    from public.app_settings where key = 'order_location_fulfillment';
  v_fmode := coalesce(v_fmode, 'fallback');

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  if v_order.status <> 'pending' then
    raise exception 'order_not_pending' using errcode = 'P0001', detail = v_order.status::text;
  end if;

  -- Enforcement (app_settings.enforcement_points, stage 'approval'): soft
  -- gate — the admin sees what is missing and may approve anyway, which is
  -- recorded in the audit row.
  v_missing := public.order_requirements_missing(v_order.customer_id, 'approval', v_order.shipping_address);
  if cardinality(v_missing) > 0 and not coalesce(p_override_requirements, false) then
    raise exception 'requirements_missing' using errcode = 'P0001', detail = array_to_string(v_missing, ',');
  end if;

  -- Lock this order's inventory rows up front in deterministic order so
  -- concurrent approvals sharing a variant serialize here (unchanged: keyed by
  -- variant_id, so multiple location-lines of the same variant lock the same
  -- rows).
  perform 1
    from public.inventory inv
   where inv.variant_id in (select oi.variant_id from public.order_items oi where oi.order_id = p_order_id)
   order by inv.variant_id, inv.location_id
     for update;

  for v_item in
    select * from public.order_items where order_id = p_order_id order by id
  loop
    v_remaining      := v_item.qty_requested;
    v_deducted_total := 0;
    v_primary_loc    := null;

    -- Unified draw order across the three cases:
    --   requested NULL           -> all locations, fullest-first (v1)
    --   requested + fallback     -> requested location first, then others fullest-first
    --   requested + strict       -> requested location only
    for v_loc in
      select inv.location_id, inv.qty, inv.unit_cost_cents
        from public.inventory inv
       where inv.variant_id = v_item.variant_id
         and inv.qty > 0
         and exists (select 1 from public.stock_locations sl
                      where sl.id = inv.location_id and sl.active)
         and (
           v_item.requested_location_id is null
           or v_fmode = 'fallback'
           or inv.location_id = v_item.requested_location_id
         )
       order by (inv.location_id = v_item.requested_location_id) desc nulls last,
                inv.qty desc, inv.location_id
    loop
      exit when v_remaining <= 0;
      v_take := least(v_remaining, v_loc.qty);
      if v_take > 0 then
        insert into public.stock_movements (variant_id, location_id, delta, reason,
                                             ref_type, ref_id, unit_cost_cents, actor_id, note)
        values (v_item.variant_id, v_loc.location_id, -v_take, 'order_approval',
                'orders', p_order_id, v_loc.unit_cost_cents, v_uid, 'order approval');
        v_remaining      := v_remaining - v_take;
        v_deducted_total := v_deducted_total + v_take;
        if v_primary_loc is null then v_primary_loc := v_loc.location_id; end if;
      end if;
    end loop;

    update public.order_items
       set qty_approved = v_deducted_total,
           location_id  = v_primary_loc
     where id = v_item.id;

    if v_deducted_total > 0 then
      v_approved_lines := v_approved_lines + 1;
    end if;

    if v_remaining > 0 then
      v_any_short   := true;
      v_short_lines := v_short_lines + 1;
      -- Bind the shortfall to the requested location when the customer chose
      -- one, else the primary deducted (v1). Gives reconciliation a single,
      -- unambiguous location to prefer when fulfilling later.
      v_recon_loc := coalesce(v_item.requested_location_id, v_primary_loc);
      insert into public.reconciliation_queue (order_item_id, variant_id, location_id, shortfall_qty, note)
      values (v_item.id, v_item.variant_id, v_recon_loc, v_remaining, 'approval shortfall')
      returning id into v_recon_id;
      v_recon_ids := array_append(v_recon_ids, v_recon_id);
    end if;
  end loop;

  update public.orders
     set status     = case when v_any_short then 'partially_approved'::public.order_status
                           else 'approved'::public.order_status end,
         decided_at = now(),
         decided_by = v_uid
   where id = p_order_id
  returning * into v_order;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, payload)
  values (v_uid, 'order_approved', 'orders', p_order_id,
          jsonb_build_object('status', v_order.status,
                             'approved_lines', v_approved_lines,
                             'short_lines', v_short_lines,
                             'fulfillment', v_fmode,
                             'requirements_overridden', to_jsonb(coalesce(v_missing, '{}'::text[])),
                             'reconciliation_ids', to_jsonb(v_recon_ids)));

  return jsonb_build_object(
    'order_id',            p_order_id,
    'status',              v_order.status,
    'approved_lines',      v_approved_lines,
    'short_lines',         v_short_lines,
    'reconciliation_ids',  to_jsonb(v_recon_ids)
  );
end;
$$;

create or replace function public.resolve_reconciliation(p_id uuid, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  v_uid       uuid := auth.uid();
  v_row       public.reconciliation_queue;
  v_item      public.order_items;
  v_order_id  uuid;
  v_loc       record;
  v_remaining integer := 0;
  v_deducted  integer := 0;
  v_take      integer;
  v_open_left integer;
  v_all_full  boolean;
begin
  if not public.is_admin_or_staff() then
    raise exception 'staff_only' using errcode = '42501';
  end if;
  if p_action not in ('fulfill', 'cancel') then
    raise exception 'bad_action' using errcode = 'P0001';
  end if;

  select * into v_row from public.reconciliation_queue where id = p_id for update;
  if not found then
    raise exception 'reconciliation_not_found' using errcode = 'P0001';
  end if;
  if v_row.status <> 'open' then
    raise exception 'reconciliation_not_open' using errcode = 'P0001';
  end if;

  select * into v_item from public.order_items where id = v_row.order_item_id;
  v_order_id := v_item.order_id;

  -- Fulfil only while the order is still open for picking. A shipped (or
  -- rejected/cancelled) order must not take more stock; its shortfall can
  -- still be cancelled.
  if p_action = 'fulfill' and not exists (
    select 1 from public.orders o
     where o.id = v_order_id
       and o.status in ('approved'::public.order_status, 'partially_approved'::public.order_status)
  ) then
    raise exception 'order_not_open' using errcode = 'P0001';
  end if;

  if p_action = 'cancel' then
    update public.reconciliation_queue
       set status = 'cancelled', resolved_at = now(), resolved_by = v_uid
     where id = p_id;

    insert into public.audit_log (actor_id, action, entity_type, entity_id, payload)
    values (v_uid, 'reconciliation_cancelled', 'reconciliation_queue', p_id,
            jsonb_build_object('order_id', v_order_id, 'shortfall_qty', v_row.shortfall_qty));
  else
    perform 1 from public.inventory inv
      where inv.variant_id = v_item.variant_id
      order by inv.location_id
        for update;

    v_remaining := v_row.shortfall_qty;
    -- Prefer the bound location (v_row.location_id) first, then fullest-first
    -- anywhere — a shortfall clears with whatever stock has since arrived.
    for v_loc in
      select inv.location_id, inv.qty, inv.unit_cost_cents
        from public.inventory inv
       where inv.variant_id = v_item.variant_id and inv.qty > 0
         and exists (select 1 from public.stock_locations sl
                      where sl.id = inv.location_id and sl.active)
       order by (inv.location_id = v_row.location_id) desc nulls last,
                inv.qty desc, inv.location_id
    loop
      exit when v_remaining <= 0;
      v_take := least(v_remaining, v_loc.qty);
      if v_take > 0 then
        insert into public.stock_movements (variant_id, location_id, delta, reason,
                                            ref_type, ref_id, unit_cost_cents, actor_id, note)
        values (v_item.variant_id, v_loc.location_id, -v_take, 'order_approval',
                'orders', v_order_id, v_loc.unit_cost_cents, v_uid, 'reconciliation fulfill');
        v_remaining := v_remaining - v_take;
        v_deducted  := v_deducted + v_take;
      end if;
    end loop;

    if v_deducted > 0 then
      update public.order_items
         set qty_approved = coalesce(qty_approved, 0) + v_deducted
       where id = v_item.id;
    end if;

    if v_remaining <= 0 then
      update public.reconciliation_queue
         set status = 'resolved', resolved_at = now(), resolved_by = v_uid
       where id = p_id;
    else
      update public.reconciliation_queue set shortfall_qty = v_remaining where id = p_id;
    end if;

    insert into public.audit_log (actor_id, action, entity_type, entity_id, payload)
    values (v_uid, 'reconciliation_fulfilled', 'reconciliation_queue', p_id,
            jsonb_build_object('order_id', v_order_id, 'deducted', v_deducted,
                               'remaining_shortfall', v_remaining));
  end if;

  select count(*) into v_open_left
    from public.reconciliation_queue rq
    join public.order_items oi on oi.id = rq.order_item_id
   where oi.order_id = v_order_id and rq.status = 'open';

  select bool_and(coalesce(qty_approved, 0) >= qty_requested) into v_all_full
    from public.order_items where order_id = v_order_id;

  if v_open_left = 0 and coalesce(v_all_full, false) then
    update public.orders set status = 'approved'
     where id = v_order_id and status = 'partially_approved';
  end if;

  return jsonb_build_object(
    'reconciliation_id',   p_id,
    'action',              p_action,
    'deducted',            v_deducted,
    'remaining_shortfall', greatest(v_remaining, 0)
  );
end;
$$;

-- Margin by model over sold orders (approved, partially approved, shipped).
-- Cost per unit is the cost snapshotted on the order's stock movement; older
-- movements without one fall back to today's cost at that location and are
-- counted as estimated. Units with no cost anywhere stay out of the margin.
create or replace function public.margin_by_model(p_include_test boolean default false)
returns table (
  model text,
  units bigint,
  revenue_cents bigint,
  costed_revenue_cents bigint,
  cost_cents bigint,
  estimated_units bigint,
  uncosted_units bigint
)
language sql
stable
security definer
set search_path to ''
as $$
  with sold as (
    select o.id as order_id, oi.variant_id, max(oi.unit_price_cents) as price,
           sum(coalesce(oi.qty_approved, 0))::bigint as units
      from public.orders o
      join public.order_items oi on oi.order_id = o.id
     where o.status in ('approved', 'partially_approved', 'shipped')
       and (p_include_test or not o.is_test)
       and public.is_admin_or_staff()
     group by o.id, oi.variant_id
  ), taken as (
    select m.ref_id as order_id, m.variant_id,
           sum(-m.delta) filter (where coalesce(m.unit_cost_cents, inv.unit_cost_cents) is not null)::bigint as costed_units,
           sum(-m.delta * coalesce(m.unit_cost_cents, inv.unit_cost_cents))::bigint as cost,
           coalesce(sum(-m.delta) filter (where m.unit_cost_cents is null and inv.unit_cost_cents is not null), 0)::bigint as est_units
      from public.stock_movements m
      left join public.inventory inv on inv.variant_id = m.variant_id and inv.location_id = m.location_id
     where m.ref_type = 'orders' and m.reason = 'order_approval'
       and m.ref_id in (select order_id from sold)
     group by m.ref_id, m.variant_id
  )
  select p.model,
         sum(s.units)::bigint,
         sum(s.units * s.price)::bigint,
         sum(least(coalesce(t.costed_units, 0), s.units) * s.price)::bigint,
         sum(coalesce(t.cost, 0))::bigint,
         sum(coalesce(t.est_units, 0))::bigint,
         sum(greatest(s.units - coalesce(t.costed_units, 0), 0))::bigint
    from sold s
    join public.product_variants pv on pv.id = s.variant_id
    join public.products p on p.id = pv.product_id
    left join taken t on t.order_id = s.order_id and t.variant_id = s.variant_id
   group by p.model
   order by 3 desc;
$$;

revoke all on function public.margin_by_model(boolean) from public, anon;
grant execute on function public.margin_by_model(boolean) to authenticated;
