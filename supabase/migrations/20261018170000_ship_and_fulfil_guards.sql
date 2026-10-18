-- Fulfilment safety (launch blocker, audit 2026-10-18).
--
-- A. mark_order_shipped refuses an order with nothing approved (0 units), and
--    refuses while reconciliation shortfalls are open unless the caller passes
--    p_close_shortfalls => true; then those shortfalls are cancelled in the
--    same transaction and listed in the shipped event + audit row.
--    Signature gains one defaulted parameter, so the old 4-argument form is
--    dropped first (no overload ambiguity for PostgREST).
-- B. resolve_reconciliation('fulfill') refuses once the order is no longer
--    approved/partially_approved, so a shipped order never takes more stock.

drop function if exists public.mark_order_shipped(uuid, text, text, text);

create or replace function public.mark_order_shipped(
  p_order_id uuid,
  p_carrier text default null,
  p_tracking text default null,
  p_note text default null,
  p_close_shortfalls boolean default false
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_role      text;
  v_order     public.orders;
  v_units     integer;
  v_open      integer;
  v_closed    uuid[] := '{}';
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

  select coalesce(sum(qty_approved), 0) into v_units from public.order_items where order_id = p_order_id;
  if v_units <= 0 then
    raise exception 'nothing_to_ship' using errcode = 'P0001';
  end if;

  select count(*) into v_open
    from public.reconciliation_queue rq
    join public.order_items oi on oi.id = rq.order_item_id
   where oi.order_id = p_order_id and rq.status = 'open';
  if v_open > 0 and not coalesce(p_close_shortfalls, false) then
    raise exception 'open_shortfall' using errcode = 'P0001', detail = v_open::text;
  end if;

  if v_open > 0 then
    with closed as (
      update public.reconciliation_queue rq
         set status = 'cancelled', resolved_at = now(), resolved_by = v_uid
        from public.order_items oi
       where oi.id = rq.order_item_id and oi.order_id = p_order_id and rq.status = 'open'
      returning rq.id
    )
    select coalesce(array_agg(id), '{}') into v_closed from closed;
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
            'tracking', v_order.tracking_number,
            'units', v_units,
            'shortfalls_closed', coalesce(array_length(v_closed, 1), 0))));

  insert into public.audit_log (actor_id, action, entity_type, entity_id, payload)
  values (v_uid, 'order_shipped', 'orders', p_order_id,
          jsonb_build_object('carrier', v_order.tracking_carrier, 'tracking', v_order.tracking_number,
                             'note', nullif(btrim(p_note), ''), 'units', v_units,
                             'closed_reconciliation_ids', to_jsonb(v_closed)));

  return v_order;
end;
$$;

revoke all on function public.mark_order_shipped(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.mark_order_shipped(uuid, text, text, text, boolean) to authenticated;

create or replace function public.resolve_reconciliation(p_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
      select inv.location_id, inv.qty
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
                                            ref_type, ref_id, actor_id, note)
        values (v_item.variant_id, v_loc.location_id, -v_take, 'order_approval',
                'orders', v_order_id, v_uid, 'reconciliation fulfill');
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

revoke all on function public.resolve_reconciliation(uuid, text) from public, anon;
grant execute on function public.resolve_reconciliation(uuid, text) to authenticated;
