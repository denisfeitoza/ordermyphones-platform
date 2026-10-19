-- Manual order: staff place an order on a customer's behalf (phone/WhatsApp).
-- place_order's body moves into place_order_core(customer, actor, ...), which
-- is NOT callable through the API (execute revoked from public/anon/
-- authenticated). Two thin wrappers call it:
--   place_order(...)      the customer's own checkout (customer = actor = auth.uid())
--   place_order_for(...)  staff only; prices, is_test, requirements and limits
--                         all come from the CUSTOMER; the actor is the staff member.
create or replace function public.place_order_core(
  p_customer uuid,
  p_actor uuid,
  p_items jsonb,
  p_shipping_address jsonb,
  p_note text,
  p_client_ref uuid,
  p_override_requirements boolean
) RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  v_uid      uuid := p_customer;
  v_role     public.user_role;
  v_tier     public.customer_tier;
  v_is_test  boolean;
  v_order    public.orders;
  v_variant  uuid;
  v_loc      uuid;
  v_qty      integer;
  v_price    bigint;
  v_subtotal bigint := 0;
  v_select   boolean;
  v_missing  text[];
begin
  if v_uid is null or p_actor is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select role, tier, is_test into v_role, v_tier, v_is_test
    from public.profiles where id = v_uid;

  if v_role is distinct from 'customer' then
    raise exception 'customer_only' using errcode = '42501';
  end if;
  if v_tier is null then
    raise exception 'no_tier' using errcode = 'P0001';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty_order' using errcode = 'P0001';
  end if;
  -- Upper bounds (anything larger is a mistake or an attack, not an order).
  if jsonb_array_length(p_items) > 500 then
    raise exception 'too_many_items' using errcode = 'P0001';
  end if;
  if p_shipping_address is not null and length(p_shipping_address::text) > 2000 then
    raise exception 'bad_address' using errcode = 'P0001';
  end if;
  -- Buyer's PO number / note: a short free-text field, not a document.
  if p_note is not null and length(p_note) > 500 then
    raise exception 'bad_note' using errcode = 'P0001';
  end if;

  -- Idempotency: the same checkout attempt (same client ref) returns the order
  -- it already created instead of creating a second one.
  if p_client_ref is not null then
    select * into v_order from public.orders where customer_id = v_uid and client_ref = p_client_ref;
    if found then
      return v_order;
    end if;
  end if;

  -- Enforcement (app_settings.enforcement_points, stage 'checkout'): hard gate.
  -- Staff placing a phone/WhatsApp order may override it (like approve_order).
  v_missing := public.order_requirements_missing(v_uid, 'checkout', p_shipping_address);
  if cardinality(v_missing) > 0 and not coalesce(p_override_requirements, false) then
    raise exception 'requirements_missing' using errcode = 'P0001', detail = array_to_string(v_missing, ',');
  end if;

  select coalesce((value->>'enabled')::boolean, false) into v_select
    from public.app_settings where key = 'order_location_selection';
  v_select := coalesce(v_select, false);

  if v_select then
    if exists (
      select 1 from (
        select bool_or((e->>'location_id') is not null) as has_loc,
               bool_and((e->>'location_id') is not null) as all_loc
        from jsonb_array_elements(p_items) e
        group by (e->>'variant_id')
      ) g where g.has_loc and not g.all_loc
    ) then
      raise exception 'partial_allocation' using errcode = 'P0001';
    end if;

    if exists (
      select 1 from jsonb_array_elements(p_items) e
      where (e->>'location_id') is not null
        and not exists (
          select 1 from public.inventory inv
          join public.stock_locations sl on sl.id = inv.location_id
          where inv.variant_id = (e->>'variant_id')::uuid
            and inv.location_id = (e->>'location_id')::uuid
            and sl.active
        )
    ) then
      raise exception 'bad_location' using errcode = 'P0001';
    end if;
  end if;

  begin
    insert into public.orders (customer_id, status, tier_at_order, subtotal_cents,
                               shipping_address, notes, is_test, client_ref)
    values (v_uid, 'pending', v_tier, 0,
            p_shipping_address, nullif(btrim(p_note), ''), coalesce(v_is_test, false), p_client_ref)
    returning * into v_order;
  exception when unique_violation then
    -- A concurrent call with the same client ref won the race: return its order.
    select * into v_order from public.orders where customer_id = v_uid and client_ref = p_client_ref;
    return v_order;
  end;

  for v_variant, v_loc, v_qty in
    select (elem->>'variant_id')::uuid,
           case when v_select then nullif(elem->>'location_id', '')::uuid else null end,
           sum((elem->>'qty')::int)::int
    from jsonb_array_elements(p_items) as elem
    group by (elem->>'variant_id')::uuid,
             case when v_select then nullif(elem->>'location_id', '')::uuid else null end
  loop
    if v_variant is null then
      raise exception 'bad_variant' using errcode = 'P0001';
    end if;
    if v_qty is null or v_qty <= 0 or v_qty > 100000 then
      raise exception 'bad_qty' using errcode = 'P0001';
    end if;

    -- Hidden (unpublished) products cannot be ordered, even by a stale cart.
    if not exists (
      select 1 from public.product_variants pv
      join public.products p on p.id = pv.product_id
      where pv.id = v_variant and p.published
    ) then
      raise exception 'bad_variant' using errcode = 'P0001', detail = v_variant::text;
    end if;

    select price_cents into v_price
      from public.prices
     where variant_id = v_variant and tier = v_tier and visible;
    if v_price is null then
      raise exception 'no_price' using errcode = 'P0001', detail = v_variant::text;
    end if;

    insert into public.order_items (order_id, variant_id, requested_location_id,
                                    qty_requested, unit_price_cents, tier)
    values (v_order.id, v_variant, v_loc, v_qty, v_price, v_tier);

    v_subtotal := v_subtotal + v_price * v_qty;
  end loop;

  update public.orders set subtotal_cents = v_subtotal
   where id = v_order.id
  returning * into v_order;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, payload)
  values (p_actor, 'order_placed', 'orders', v_order.id,
          jsonb_build_object('subtotal_cents', v_subtotal, 'tier', v_tier,
                             'location_selection', v_select,
                             'customer_id', v_uid,
                             'placed_by_staff', p_actor <> v_uid,
                             'requirements_overridden',
                               p_actor <> v_uid and cardinality(v_missing) > 0));

  if p_actor <> v_uid then
    insert into public.order_events (order_id, actor_id, actor_role, kind, summary, changes)
    select v_order.id, p_actor, coalesce(pr.role::text, 'staff'), 'placed_by_staff', nullif(btrim(p_note), ''),
           jsonb_build_array(jsonb_build_object('type', 'placed_by_staff', 'label', 'Order placed by our team'))
      from public.profiles pr where pr.id = p_actor;
  end if;

  return v_order;
end;
$$;


revoke all on function public.place_order_core(uuid, uuid, jsonb, jsonb, text, uuid, boolean) from public, anon, authenticated;

create or replace function public.place_order(p_items jsonb, p_shipping_address jsonb default null, p_note text default null, p_client_ref uuid default null)
returns public.orders
language plpgsql
security definer
set search_path to ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  return public.place_order_core(auth.uid(), auth.uid(), p_items, p_shipping_address, p_note, p_client_ref, false);
end;
$$;

create or replace function public.place_order_for(
  p_customer_id uuid,
  p_items jsonb,
  p_shipping_address jsonb default null,
  p_note text default null,
  p_client_ref uuid default null,
  p_override_requirements boolean default false
)
returns public.orders
language plpgsql
security definer
set search_path to ''
as $$
begin
  if auth.uid() is null or not public.is_admin_or_staff() then
    raise exception 'staff_only' using errcode = '42501';
  end if;
  if p_customer_id is null or p_customer_id = auth.uid() then
    raise exception 'customer_only' using errcode = '42501';
  end if;
  return public.place_order_core(p_customer_id, auth.uid(), p_items, p_shipping_address, p_note, p_client_ref, p_override_requirements);
end;
$$;

revoke all on function public.place_order_for(uuid, jsonb, jsonb, text, uuid, boolean) from public, anon;
grant execute on function public.place_order_for(uuid, jsonb, jsonb, text, uuid, boolean) to authenticated;
