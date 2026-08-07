-- 20260807230000_order_location_selection.sql
-- M2-P3 — modular per-location picking. The customer may allocate a variant's
-- units to specific stock locations ("3 from Texas, 2 from Tennessee"), gated
-- by app_settings.order_location_selection. When OFF, this path is byte-
-- identical to v1 (order holds nothing; approval sources fullest-first and
-- reconciles shortfalls) — the removability guarantee (M2-D3): flip the flag
-- OFF and no code is ripped out, no down-migration is needed.
--
-- Design (advisor-reviewed, see .planning/M2-P3-DESIGN.md):
--   * requested_location_id (new, nullable) = the customer's chosen source.
--     location_id (existing) stays = primary location actually deducted at
--     approval. Two columns, two meanings.
--   * unique(order_id, variant_id) -> unique NULLS NOT DISTINCT
--     (order_id, variant_id, requested_location_id): NULL rows still collapse
--     to one-per-variant (exact v1), non-NULL locations split freely.
--   * place_order: OFF strips locations (v1). ON enforces all-or-nothing per
--     variant (never mixed located+NULL for one variant) and validates each
--     requested location is active + actually stocks the variant.
--   * approve_order fulfillment: FALLBACK (default) deducts the requested
--     location first then others fullest-first, reconciling only the true
--     global shortfall; STRICT deducts only the requested location. Config
--     order_location_fulfillment.
-- Money integer cents; SECURITY DEFINER, search_path='', role-gated inside.

------------------------------------------------------------------
-- A. Schema: requested source column + split-friendly uniqueness
------------------------------------------------------------------
alter table public.order_items
  add column if not exists requested_location_id uuid references public.stock_locations(id);

comment on column public.order_items.requested_location_id is
  'The stock location the CUSTOMER chose to source this line from (M2-P3), or NULL for system-decide (v1 / order_location_selection OFF). Distinct from location_id, which records where approval actually deducted.';

alter table public.order_items drop constraint if exists order_items_order_id_variant_id_key;
-- NULLS NOT DISTINCT so a NULL-sourced line still collapses to one row per
-- variant (the exact v1 guarantee); non-NULL locations split per (variant, loc).
alter table public.order_items
  add constraint order_items_order_variant_reqloc_key
  unique nulls not distinct (order_id, variant_id, requested_location_id);

------------------------------------------------------------------
-- B. Config (admin-editable). Selection ships OFF for rollout (target ON per
--    M2-D3 once the picker UI lands); fulfillment defaults to fallback.
------------------------------------------------------------------
insert into public.app_settings (key, value) values
  ('order_location_selection',   '{"enabled":false}'::jsonb),
  ('order_location_fulfillment', '{"mode":"fallback"}'::jsonb)
on conflict (key) do nothing;

------------------------------------------------------------------
-- C. place_order — now location-aware (gated by order_location_selection)
------------------------------------------------------------------
create or replace function public.place_order(
  p_items            jsonb,
  p_shipping_address jsonb default null,
  p_note             text  default null
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

  select coalesce((value->>'enabled')::boolean, false) into v_select
    from public.app_settings where key = 'order_location_selection';
  v_select := coalesce(v_select, false);

  if v_select then
    -- All-or-nothing per variant: never mix located + NULL lines for one
    -- variant (would race the same balance at approval). Either every unit is
    -- allocated to a location, or none are (system-decide).
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

    -- Every requested location must be an ACTIVE location that actually stocks
    -- the variant (has an inventory row) — else a client could request a
    -- location that doesn't carry the item and manufacture a reconciliation.
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

  insert into public.orders (customer_id, status, tier_at_order, subtotal_cents,
                             shipping_address, notes, is_test)
  values (v_uid, 'pending', v_tier, 0,
          p_shipping_address, nullif(btrim(p_note), ''), coalesce(v_is_test, false))
  returning * into v_order;

  -- Group by (variant, requested_location). When selection is OFF the location
  -- is forced NULL, collapsing to one row per variant = exact v1 behavior.
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

    -- Price is per (variant, tier) — location does not change price (the
    -- cross-location basis is already resolved into public.prices).
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

------------------------------------------------------------------
-- D. approve_order — honor the requested location (fallback | strict)
------------------------------------------------------------------
create or replace function public.approve_order(p_order_id uuid)
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

------------------------------------------------------------------
-- E. resolve_reconciliation — fulfill prefers the bound location
------------------------------------------------------------------
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

------------------------------------------------------------------
-- F. my_order_items — expose the requested location (customer-safe)
------------------------------------------------------------------
create or replace view public.my_order_items
with (security_invoker = false) as
  -- New M2-P3 columns are appended AT THE END so `create or replace view`
  -- (which forbids reordering/renaming existing columns) succeeds.
  select oi.id,
         oi.order_id,
         oi.variant_id,
         oi.qty_requested,
         oi.qty_approved,
         oi.unit_price_cents,
         oi.tier,
         oi.location_id,
         pv.sku,
         p.make,
         p.model,
         pv.capacity,
         pv.color,
         pv.carrier      as carrier_code,
         pv.lock_status,
         oi.requested_location_id,
         rl.display_name as requested_location_name
    from public.order_items oi
    join public.product_variants pv on pv.id = oi.variant_id
    join public.products p          on p.id  = pv.product_id
    join public.orders o            on o.id  = oi.order_id
    left join public.stock_locations rl on rl.id = oi.requested_location_id
   where o.customer_id = (select auth.uid()) or (select public.is_admin_or_staff());

comment on view public.my_order_items is
  'Customer-safe order-line display (M2-P3: adds requested_location_id + its display_name). Definer view; scoped to the caller''s own orders (staff see all). No cost, grade, carrier_raw or supplier identity.';

revoke all on public.my_order_items from public, anon;
grant select on public.my_order_items to authenticated;
