-- Cancel an order (audit 2026-10-18, P1 + customer feature).
--
-- staff/admin : pending, approved or partially approved orders (not shipped).
--               Stock taken at approval/fulfil is put back with compensating
--               'order_cancel' movements (append-only ledger), and the order's
--               open shortfalls are cancelled.
-- customer    : their own order (or one placed under their account) while it
--               is still pending — nothing was deducted yet.
-- Every cancel writes an order_events row the customer sees and an audit row.

create or replace function public.cancel_order(p_order_id uuid, p_reason text default null)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_role     text;
  v_staff    boolean := public.is_admin_or_staff();
  v_order    public.orders;
  v_restored integer := 0;
  v_closed   integer := 0;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;

  if not v_staff then
    -- a customer may cancel their own pending order; an account owner may also
    -- cancel a pending order placed by one of their sub-accounts
    if v_order.customer_id <> v_uid and not exists (
         select 1 from public.profiles p
          where p.id = v_order.customer_id and p.parent_account_id = v_uid
       ) then
      raise exception 'order_not_found' using errcode = 'P0001';
    end if;
    if v_order.status <> 'pending' then
      raise exception 'order_not_cancellable' using errcode = 'P0001', detail = v_order.status::text;
    end if;
  elsif v_order.status not in ('pending'::public.order_status, 'approved'::public.order_status,
                               'partially_approved'::public.order_status) then
    raise exception 'order_not_cancellable' using errcode = 'P0001', detail = v_order.status::text;
  end if;

  -- Put back every unit this order took (approval + reconciliation fulfils).
  if v_order.status <> 'pending' then
    perform 1 from public.inventory inv
     where (inv.variant_id, inv.location_id) in (
       select m.variant_id, m.location_id from public.stock_movements m
        where m.ref_type = 'orders' and m.ref_id = p_order_id)
     order by inv.variant_id, inv.location_id
       for update;

    with taken as (
      select m.variant_id, m.location_id, sum(m.delta) as net
        from public.stock_movements m
       where m.ref_type = 'orders' and m.ref_id = p_order_id
       group by m.variant_id, m.location_id
      having sum(m.delta) < 0
    ), ins as (
      insert into public.stock_movements (variant_id, location_id, delta, reason, ref_type, ref_id, actor_id, note)
      select t.variant_id, t.location_id, -t.net, 'order_cancel', 'orders', p_order_id, v_uid, 'order cancelled'
        from taken t
      returning delta
    )
    select coalesce(sum(delta), 0) into v_restored from ins;

    with closed as (
      update public.reconciliation_queue rq
         set status = 'cancelled', resolved_at = now(), resolved_by = v_uid
        from public.order_items oi
       where oi.id = rq.order_item_id and oi.order_id = p_order_id and rq.status = 'open'
      returning rq.id
    )
    select count(*) into v_closed from closed;
  end if;

  update public.orders
     set status = 'cancelled',
         decided_at = now(),
         decided_by = v_uid,
         decision_reason = nullif(btrim(p_reason), ''),
         updated_at = now()
   where id = p_order_id
  returning * into v_order;

  select role::text into v_role from public.profiles where id = v_uid;

  insert into public.order_events (order_id, actor_id, actor_role, kind, summary, changes)
  values (p_order_id, v_uid, coalesce(v_role, 'customer'), 'cancelled', nullif(btrim(p_reason), ''),
          jsonb_build_array(jsonb_build_object('type', 'cancelled', 'label', 'Order cancelled',
                                               'units_restored', v_restored)));

  insert into public.audit_log (actor_id, action, entity_type, entity_id, payload)
  values (v_uid, 'order_cancelled', 'orders', p_order_id,
          jsonb_build_object('reason', nullif(btrim(p_reason), ''), 'units_restored', v_restored,
                             'shortfalls_closed', v_closed, 'by_staff', v_staff));

  return v_order;
end;
$$;

revoke all on function public.cancel_order(uuid, text) from public, anon;
grant execute on function public.cancel_order(uuid, text) to authenticated;
