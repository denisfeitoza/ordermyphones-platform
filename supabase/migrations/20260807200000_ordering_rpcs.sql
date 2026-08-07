-- 20260807200000_ordering_rpcs.sql
-- Phase 6 (Ordering, Approval & Reconciliation) — the core business loop.
-- AUTHORED by the build agent; the orchestrator applies it via the Supabase
-- MCP (this agent does not apply migrations). Builds on the Phase 1 scaffold
-- (20260806120500_orders_and_audit_scaffold.sql): orders, order_items,
-- reconciliation_queue, audit_log already exist with RLS. This migration adds
-- the two missing columns and the four RPCs that ARE the D5 flow:
--
--   D5  — stock deducts on APPROVAL, not at order placement. Orders hold
--         nothing; approval validates against the live balance and deducts
--         transactionally; shortfalls land in reconciliation_queue.
--   D7  — NO minimum-quantity / multiples enforcement (config only, shipped
--         OFF): a 'cart_quantity_rules' app_settings key is seeded off and is
--         never consulted by any code path here.
--
-- Money is integer cents end to end. Prices are captured server-side from the
-- CALLER's own tier (public.prices, visible only) — a client-sent price is
-- never trusted (the insecure client-write policies are dropped in §B).
--
-- Convention (matches every prior migration): SECURITY DEFINER, owned by
-- postgres, `set search_path = ''` with fully schema-qualified bodies, EXECUTE
-- revoked from public/anon/authenticated then granted only to authenticated.
-- Role is gated INSIDE each function (auth.uid() / is_admin_or_staff()), never
-- by leaving the function open.

------------------------------------------------------------------
-- A. Columns the scaffold lacks
------------------------------------------------------------------
-- shipping_address: captured at checkout / from the profile (Phase 5 G1).
--   jsonb (street/city/state/zip), off-system shipping (D8) — never a live
--   join to profiles so a later address edit does not rewrite a placed order.
-- decision_reason: the staff reason on reject. Deliberately NOT orders.notes,
--   which is the CUSTOMER's own order note — the two must not collide.
alter table public.orders
  add column if not exists shipping_address jsonb,
  add column if not exists decision_reason  text;

-- order_items.location_id: the primary location a line was deducted from at
-- approval (informational — a line can span locations; this records the first
-- deducted). Nullable: null until approved, or when the line was fully short.
alter table public.order_items
  add column if not exists location_id uuid references public.stock_locations(id);

comment on column public.orders.shipping_address is
  'Checkout/profile snapshot (street/city/state/zip). Off-system shipping (D8); a snapshot, not a live profiles join.';
comment on column public.orders.decision_reason is
  'Staff reason recorded on reject_order. NOT the customer note (public.orders.notes) — different author, different meaning.';
comment on column public.order_items.location_id is
  'Primary stock location this line was deducted from at approval (informational; a line may deduct across several locations).';

------------------------------------------------------------------
-- B. Close the client price-injection hole
------------------------------------------------------------------
-- The scaffold's "orders own insert" / "order items own insert" policies let a
-- signed-in customer POST /rest/v1/orders and /rest/v1/order_items directly
-- with arbitrary subtotal_cents / tier_at_order / unit_price_cents — a direct
-- bypass of "never trust a client-sent price". Verified 2026-08-07 that no
-- frontend code writes these tables (grep: only place_order below does).
-- place_order (SECURITY DEFINER) is now the ONLY sanctioned write path; the
-- owner-read and staff policies stay untouched.
drop policy if exists "orders own insert"      on public.orders;
drop policy if exists "order items own insert" on public.order_items;

------------------------------------------------------------------
-- C. place_order — customer places a PENDING order. Holds NO stock.
------------------------------------------------------------------
-- p_items: jsonb array of {variant_id, qty}. Prices are read from the caller's
-- own tier (public.prices, visible). Any line without a visible price for that
-- tier aborts the WHOLE order ('no_price'). One transaction — a raise rolls
-- back the half-built order.
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
  v_qty      integer;
  v_price    bigint;
  v_subtotal bigint := 0;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select role, tier, is_test into v_role, v_tier, v_is_test
    from public.profiles where id = v_uid;

  -- Ordering is a customer action only (admin/staff have no tier and place no
  -- orders). Gate here rather than trusting RLS — this is a definer function.
  if v_role is distinct from 'customer' then
    raise exception 'customer_only' using errcode = '42501';
  end if;
  if v_tier is null then
    -- orders.tier_at_order is NOT NULL; raise a legible error instead of an
    -- opaque constraint violation for an unassigned customer.
    raise exception 'no_tier' using errcode = 'P0001';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty_order' using errcode = 'P0001';
  end if;

  -- Header first (subtotal filled in after the lines are priced). is_test is
  -- inherited from the customer so reports can exclude test rows (LNCH-01).
  insert into public.orders (customer_id, status, tier_at_order, subtotal_cents,
                             shipping_address, notes, is_test)
  values (v_uid, 'pending', v_tier, 0,
          p_shipping_address, nullif(btrim(p_note), ''), coalesce(v_is_test, false))
  returning * into v_order;

  -- Aggregate qty per variant (a client may send the same variant twice; the
  -- unique(order_id, variant_id) constraint would otherwise abort).
  for v_variant, v_qty in
    select (elem->>'variant_id')::uuid, sum((elem->>'qty')::int)::int
    from jsonb_array_elements(p_items) as elem
    group by (elem->>'variant_id')::uuid
  loop
    if v_variant is null then
      raise exception 'bad_variant' using errcode = 'P0001';
    end if;
    if v_qty is null or v_qty <= 0 then
      raise exception 'bad_qty' using errcode = 'P0001';
    end if;

    -- CALLER's tier price only, visible only. unique(variant_id, tier) => one
    -- row at most. A missing/hidden price aborts the whole order.
    select price_cents into v_price
      from public.prices
     where variant_id = v_variant and tier = v_tier and visible;
    if v_price is null then
      raise exception 'no_price' using errcode = 'P0001', detail = v_variant::text;
    end if;

    insert into public.order_items (order_id, variant_id, qty_requested, unit_price_cents, tier)
    values (v_order.id, v_variant, v_qty, v_price, v_tier);

    v_subtotal := v_subtotal + v_price * v_qty;
  end loop;

  update public.orders set subtotal_cents = v_subtotal
   where id = v_order.id
  returning * into v_order;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, payload)
  values (v_uid, 'order_placed', 'orders', v_order.id,
          jsonb_build_object('subtotal_cents', v_subtotal, 'tier', v_tier));

  return v_order;
end;
$$;

------------------------------------------------------------------
-- D. approve_order — staff decision. Deduct-on-approval (D5).
------------------------------------------------------------------
-- For each line: deduct min(qty_requested, live balance) across locations via
-- an order_approval movement (negative delta); any shortfall opens a
-- reconciliation_queue row. Order -> 'approved' (all full) or
-- 'partially_approved' (any short). One transaction; returns a jsonb summary.
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
  v_any_short      boolean := false;
  v_approved_lines integer := 0;
  v_short_lines    integer := 0;
  v_recon_ids      uuid[] := '{}';
  v_recon_id       uuid;
begin
  if not public.is_admin_or_staff() then
    raise exception 'staff_only' using errcode = '42501';
  end if;

  -- Lock the order row: a double-click must not deduct twice.
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  if v_order.status <> 'pending' then
    raise exception 'order_not_pending' using errcode = 'P0001', detail = v_order.status::text;
  end if;

  -- Lock this order's inventory rows up front, in a deterministic
  -- (variant_id, location_id) order, so two concurrent approvals sharing a
  -- variant serialize here instead of one hitting the inventory.qty >= 0
  -- check and aborting the whole approval with an opaque error. Reading the
  -- balance from inventory (not ledger_balance) is sound: the balance-sync
  -- trigger + its fail-loud guard keep inventory.qty == sum(ledger).
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

    -- Draw down from the fullest locations first.
    for v_loc in
      select inv.location_id, inv.qty
        from public.inventory inv
       where inv.variant_id = v_item.variant_id and inv.qty > 0
       order by inv.qty desc, inv.location_id
    loop
      exit when v_remaining <= 0;
      v_take := least(v_remaining, v_loc.qty);
      if v_take > 0 then
        -- delta <> 0 always holds here (v_take > 0). A line with zero balance
        -- everywhere skips this insert entirely and goes fully to shortfall.
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
      insert into public.reconciliation_queue (order_item_id, variant_id, location_id, shortfall_qty, note)
      values (v_item.id, v_item.variant_id, v_primary_loc, v_remaining, 'approval shortfall')
      returning id into v_recon_id;
      v_recon_ids := array_append(v_recon_ids, v_recon_id);
    end if;
  end loop;

  -- status + decided_at set together (orders_decision_metadata_check).
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
-- E. reject_order — staff decision, nothing deducted.
------------------------------------------------------------------
create or replace function public.reject_order(p_order_id uuid, p_reason text)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_order public.orders;
begin
  if not public.is_admin_or_staff() then
    raise exception 'staff_only' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  if v_order.status <> 'pending' then
    raise exception 'order_not_pending' using errcode = 'P0001', detail = v_order.status::text;
  end if;

  update public.orders
     set status          = 'rejected',
         decided_at      = now(),
         decided_by      = v_uid,
         decision_reason = nullif(btrim(p_reason), '')
   where id = p_order_id
  returning * into v_order;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, payload)
  values (v_uid, 'order_rejected', 'orders', p_order_id,
          jsonb_build_object('reason', nullif(btrim(p_reason), '')));

  return v_order;
end;
$$;

------------------------------------------------------------------
-- F. resolve_reconciliation — clear an open shortfall row.
------------------------------------------------------------------
-- 'fulfill': deduct the remaining shortfall now (if stock arrived), bump
--            qty_approved, and resolve — or, if only partly covered, reduce
--            the shortfall and stay open.
-- 'cancel' : close the row, leaving the partial approval as-is.
-- If, after a fulfill, an order has no open shortfalls and every line is fully
-- approved, its status is promoted partially_approved -> approved.
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
    -- fulfill: lock the variant's inventory, then draw down the shortfall.
    perform 1 from public.inventory inv
      where inv.variant_id = v_item.variant_id
      order by inv.location_id
        for update;

    v_remaining := v_row.shortfall_qty;
    for v_loc in
      select inv.location_id, inv.qty
        from public.inventory inv
       where inv.variant_id = v_item.variant_id and inv.qty > 0
       order by inv.qty desc, inv.location_id
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
      -- Partly covered: shrink the shortfall (stays > 0, check holds), keep open.
      update public.reconciliation_queue set shortfall_qty = v_remaining where id = p_id;
    end if;

    insert into public.audit_log (actor_id, action, entity_type, entity_id, payload)
    values (v_uid, 'reconciliation_fulfilled', 'reconciliation_queue', p_id,
            jsonb_build_object('order_id', v_order_id, 'deducted', v_deducted,
                               'remaining_shortfall', v_remaining));
  end if;

  -- Promote the order to fully approved once nothing is outstanding.
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
-- G. Grants — RPCs to authenticated only; role gated inside each body.
------------------------------------------------------------------
revoke execute on function public.place_order(jsonb, jsonb, text)          from public, anon, authenticated;
revoke execute on function public.approve_order(uuid)                       from public, anon, authenticated;
revoke execute on function public.reject_order(uuid, text)                  from public, anon, authenticated;
revoke execute on function public.resolve_reconciliation(uuid, text)        from public, anon, authenticated;

grant execute on function public.place_order(jsonb, jsonb, text)            to authenticated;
grant execute on function public.approve_order(uuid)                        to authenticated;
grant execute on function public.reject_order(uuid, text)                   to authenticated;
grant execute on function public.resolve_reconciliation(uuid, text)         to authenticated;

------------------------------------------------------------------
-- H. Cart quantity rules — config only, shipped OFF (D7).
------------------------------------------------------------------
-- Seeded so the admin panel has a key to toggle; NO code path here (or in the
-- cart) reads it. mode: 'off' | 'warn' | 'block' — enforcement is a later,
-- deliberate opt-in, never a hardcoded cart gate.
insert into public.app_settings (key, value)
values ('cart_quantity_rules', '{"mode":"off"}'::jsonb)
on conflict (key) do nothing;

------------------------------------------------------------------
-- I. my_order_items — customer-safe order-line display.
------------------------------------------------------------------
-- order_items only carries variant_id; product_variants/products are
-- staff-only (no customer policy), and an ORDERED variant may now be out of
-- stock and therefore absent from public.catalog_listing — so a customer
-- cannot resolve its own order lines' names through any existing path. This
-- definer view joins the safe display fields (make/model/capacity/color/
-- carrier/lock/sku — never cost, grade, carrier_raw or supplier identity) and
-- scopes rows to the caller's own orders (staff see all), mirroring the
-- variant_price_for_me pattern (NOT security_invoker — that would return zero
-- rows since the base tables have no customer SELECT policy).
create view public.my_order_items
with (security_invoker = false) as
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
         pv.lock_status
    from public.order_items oi
    join public.product_variants pv on pv.id = oi.variant_id
    join public.products p          on p.id  = pv.product_id
    join public.orders o            on o.id  = oi.order_id
   where o.customer_id = (select auth.uid()) or (select public.is_admin_or_staff());

comment on view public.my_order_items is
  'Customer-safe order-line display: joins order_items to safe variant/product fields (make/model/capacity/color/carrier/lock/sku), scoped to the caller''s own orders. Definer view (NOT security_invoker) — the base tables have no customer SELECT policy, so security_invoker would return zero rows. Exposes no cost, grade, carrier_raw or supplier identity.';

revoke all on public.my_order_items from public, anon;
grant select on public.my_order_items to authenticated;

-- RLS note: orders / order_items already carry owner-read + staff-read/update
-- policies, and reconciliation_queue is staff-read-only, all from the Phase 1
-- scaffold — exactly deliverable 1's RLS requirement. No new policies are
-- created here; the four RPCs are SECURITY DEFINER and there is no
-- `force row level security` anywhere, so their writes bypass RLS by design.
