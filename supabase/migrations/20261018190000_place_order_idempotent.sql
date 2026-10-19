-- Idempotent place_order (launch blocker, audit 2026-10-18).
--
-- A network drop after a successful place_order, followed by a retry, created
-- a second identical order. The client now sends one random p_client_ref per
-- checkout attempt; orders store it (unique per customer), and a repeat call
-- with the same ref returns the existing order — including when two calls
-- race (unique_violation is caught and the winner's order returned).
-- Signature gains one defaulted parameter, so the old 3-argument form is
-- dropped first. Body otherwise identical to the live function.

alter table public.orders add column if not exists client_ref uuid;
comment on column public.orders.client_ref is 'Random id per checkout attempt (client-generated); makes place_order idempotent per customer.';
create unique index if not exists orders_customer_client_ref_key
  on public.orders (customer_id, client_ref) where client_ref is not null;

drop function if exists public.place_order(jsonb, jsonb, text);

create or replace function public.place_order(
  p_items jsonb,
  p_shipping_address jsonb default null,
  p_note text default null,
  p_client_ref uuid default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
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
begin
  if v_uid is null then
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

  -- Idempotency: the same checkout attempt (same client ref) returns the order
  -- it already created instead of creating a second one.
  if p_client_ref is not null then
    select * into v_order from public.orders where customer_id = v_uid and client_ref = p_client_ref;
    if found then
      return v_order;
    end if;
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
    if v_qty is null or v_qty <= 0 then
      raise exception 'bad_qty' using errcode = 'P0001';
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
  values (v_uid, 'order_placed', 'orders', v_order.id,
          jsonb_build_object('subtotal_cents', v_subtotal, 'tier', v_tier,
                             'location_selection', v_select));

  return v_order;
end;
$$;

revoke all on function public.place_order(jsonb, jsonb, text, uuid) from public, anon;
grant execute on function public.place_order(jsonb, jsonb, text, uuid) to authenticated;
