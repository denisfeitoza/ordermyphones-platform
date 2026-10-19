-- Manual tracking after shipping. mark_order_shipped takes carrier + tracking
-- only at the moment of shipping; an order shipped without them (bulk "mark
-- shipped", or the number not known yet) had no way to get one later, and a
-- typo could not be fixed. set_order_tracking changes ONLY the carrier and
-- tracking number of a shipped order, staff/admin only, and records the change
-- in order_events (customer timeline) and audit_log. orders RLS is unchanged:
-- clients still write orders only through SECURITY DEFINER RPCs.
create or replace function public.set_order_tracking(p_order_id uuid, p_carrier text, p_tracking text)
returns public.orders
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid      uuid := auth.uid();
  v_role     text;
  v_order    public.orders;
  v_carrier  text := nullif(btrim(p_carrier), '');
  v_tracking text := nullif(btrim(p_tracking), '');
  v_old_c    text;
  v_old_t    text;
begin
  if not (select public.is_admin_or_staff()) then
    raise exception 'staff_only' using errcode = '42501';
  end if;
  if length(v_carrier) > 40 then
    raise exception 'bad_carrier' using errcode = 'P0001';
  end if;
  if length(v_tracking) > 100 then
    raise exception 'bad_tracking' using errcode = 'P0001';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  if v_order.status <> 'shipped'::public.order_status then
    raise exception 'order_not_shipped' using errcode = 'P0001', detail = v_order.status::text;
  end if;

  v_old_c := v_order.tracking_carrier;
  v_old_t := v_order.tracking_number;
  if v_old_c is not distinct from v_carrier and v_old_t is not distinct from v_tracking then
    return v_order; -- nothing changed: no event, no audit row
  end if;

  update public.orders
     set tracking_carrier = v_carrier,
         tracking_number  = v_tracking,
         updated_at       = now()
   where id = p_order_id
  returning * into v_order;

  select role::text into v_role from public.profiles where id = v_uid;

  insert into public.order_events (order_id, actor_id, actor_role, kind, summary, changes)
  values (p_order_id, v_uid, coalesce(v_role, 'staff'), 'tracking_updated', null,
          jsonb_build_array(jsonb_build_object(
            'type', 'tracking',
            'label', 'Tracking',
            'carrier', v_carrier,
            'tracking', v_tracking,
            'old_carrier', v_old_c,
            'old_tracking', v_old_t)));

  insert into public.audit_log (actor_id, action, entity_type, entity_id, payload)
  values (v_uid, 'order_tracking_set', 'orders', p_order_id,
          jsonb_build_object('carrier', v_carrier, 'tracking', v_tracking,
                             'old_carrier', v_old_c, 'old_tracking', v_old_t));

  return v_order;
end;
$function$;

revoke all on function public.set_order_tracking(uuid, text, text) from public, anon;
grant execute on function public.set_order_tracking(uuid, text, text) to authenticated;
