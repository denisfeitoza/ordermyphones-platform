-- Database hardening (audit 2026-10-18, P1).
--
-- A. orders / order_items: clients write ONLY through the SECURITY DEFINER
--    RPCs (place_order, approve_order, reject_order, admin_edit_order,
--    mark_order_shipped, resolve_reconciliation, reset_test_data). Direct
--    table writes let staff mark an order approved without deducting stock,
--    or flag a real order is_test (which reset_test_data would then delete).
--    The web app performs no direct writes on these tables.
-- B. vendor_grade_map / import_synonyms: staff-only reads. They named the
--    supplier file format and internal vendor grades to every customer; the
--    storefront reads them only through owner-rights views/functions.
-- C. place_order refuses variants of unpublished products ('bad_variant').

revoke insert, update, delete, truncate on public.orders, public.order_items from anon, authenticated;

alter policy "vendor_grade_map read all authenticated" on public.vendor_grade_map
  using ( (select public.is_admin_or_staff()) );
alter policy "vendor_grade_map read all authenticated" on public.vendor_grade_map rename to "vendor_grade_map staff read";

alter policy "import_synonyms read all authenticated" on public.import_synonyms
  using ( (select public.is_admin_or_staff()) );
alter policy "import_synonyms read all authenticated" on public.import_synonyms rename to "import_synonyms staff read";

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
  values (v_uid, 'order_placed', 'orders', v_order.id,
          jsonb_build_object('subtotal_cents', v_subtotal, 'tier', v_tier,
                             'location_selection', v_select));

  return v_order;
end;
$$;

revoke all on function public.place_order(jsonb, jsonb, text, uuid) from public, anon;
grant execute on function public.place_order(jsonb, jsonb, text, uuid) to authenticated;
