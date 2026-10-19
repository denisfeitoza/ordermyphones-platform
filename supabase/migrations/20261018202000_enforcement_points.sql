-- Enforcement points become real (audit 2026-10-18, P1).
--
-- app_settings.enforcement_points says, per detail, whether it is required at
-- 'checkout' and/or at 'approval'. Nothing read it. Now:
--   order_requirements_missing(customer, stage, shipping) -> text[] of
--     'business_name' (account display name), 'shipping_address' (street, city,
--     state, zip on the order), 'tax_certificate' (a file in the account
--     owner's tax-certificates folder; business tiers only — consumer is exempt)
--   place_order  : hard gate at 'checkout' (requirements_missing).
--   approve_order: soft gate at 'approval' — refuses unless
--     p_override_requirements => true; the override is written to the audit row.
--   my_order_requirements(): the signed-in customer's own checklist for both
--     stages (shipping is checked on the order itself, so it is not listed).
-- Sub-accounts are judged on their account owner's name, tier and certificate.

create or replace function public.order_requirements_missing(p_customer uuid, p_stage text, p_shipping jsonb)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cfg   jsonb;
  v_acct  uuid;
  v_tier  text;
  v_name  text;
  v_out   text[] := '{}';
begin
  select value into v_cfg from public.app_settings where key = 'enforcement_points';
  v_cfg := coalesce(v_cfg, '{}'::jsonb);

  select coalesce(p.parent_account_id, p.id) into v_acct from public.profiles p where p.id = p_customer;
  select o.tier::text, o.display_name into v_tier, v_name from public.profiles o where o.id = v_acct;

  if coalesce((v_cfg->'g1_business_name'->>p_stage)::boolean, false)
     and coalesce(btrim(v_name), '') = '' then
    v_out := array_append(v_out, 'business_name');
  end if;

  if coalesce((v_cfg->'shipping_address'->>p_stage)::boolean, false)
     and (coalesce(btrim(p_shipping->>'street'), '') = '' or coalesce(btrim(p_shipping->>'city'), '') = ''
          or coalesce(btrim(p_shipping->>'state'), '') = '' or coalesce(btrim(p_shipping->>'zip'), '') = '') then
    v_out := array_append(v_out, 'shipping_address');
  end if;

  if coalesce((v_cfg->'g2_tax_certificate'->>p_stage)::boolean, false)
     and v_tier in ('retailer', 'wholesale', 'distributor')
     and not exists (
       select 1 from storage.objects so
        where so.bucket_id = 'tax-certificates' and so.name like v_acct::text || '/%'
     ) then
    v_out := array_append(v_out, 'tax_certificate');
  end if;

  return v_out;
end;
$$;

revoke all on function public.order_requirements_missing(uuid, text, jsonb) from public, anon, authenticated;

create or replace function public.my_order_requirements()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_full jsonb := '{"street":"x","city":"x","state":"x","zip":"x"}'::jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'checkout', to_jsonb(public.order_requirements_missing(v_uid, 'checkout', v_full)),
    'approval', to_jsonb(public.order_requirements_missing(v_uid, 'approval', v_full))
  );
end;
$$;

revoke all on function public.my_order_requirements() from public, anon;
grant execute on function public.my_order_requirements() to authenticated;

drop function if exists public.approve_order(uuid);

create or replace function public.approve_order(p_order_id uuid, p_override_requirements boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
      select inv.location_id, inv.qty
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
                                             ref_type, ref_id, actor_id, note)
        values (v_item.variant_id, v_loc.location_id, -v_take, 'order_approval',
                'orders', p_order_id, v_uid, 'order approval');
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

revoke all on function public.approve_order(uuid, boolean) from public, anon;
grant execute on function public.approve_order(uuid, boolean) to authenticated;

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
  v_missing  text[];
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

  -- Enforcement (app_settings.enforcement_points, stage 'checkout'): hard gate.
  v_missing := public.order_requirements_missing(v_uid, 'checkout', p_shipping_address);
  if cardinality(v_missing) > 0 then
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
