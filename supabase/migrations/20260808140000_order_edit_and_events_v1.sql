-- Order edit + shared edit log (v1)
--
-- Adds:
--   1. order_events: a customer-visible log of admin edits to a pending order.
--      RLS lets the owning customer read their own order's events and admin/staff
--      read all; only SECURITY DEFINER RPCs write (no direct DML policies).
--   2. admin_edit_order: transactional full edit of a PENDING order — change item
--      quantities/prices, add/remove items, edit shipping address and note. Records
--      a human-readable diff into order_events. Editing is restricted to `pending`
--      because approval writes stock_movements + reconciliation_queue; editing a
--      decided order would desync the ledger.
--
-- Deliberately does NOT touch place_order/approve_order/reject_order: the timeline's
-- placed/decided rows are derived in the UI from existing columns (placed_at,
-- status, decided_at, decision_reason). Only edits are stored here.

create table if not exists public.order_events (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders(id) on delete cascade,
  actor_id   uuid references public.profiles(id),
  actor_role text,
  kind       text not null,                    -- 'edited' (v1)
  summary    text,                             -- optional admin note / reason
  changes    jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists order_events_order_id_idx
  on public.order_events (order_id, created_at);

alter table public.order_events enable row level security;

-- Admin/staff read all; a customer reads only events for their own orders.
drop policy if exists order_events_read on public.order_events;
create policy order_events_read on public.order_events
  for select
  using (
    public.is_admin_or_staff()
    or exists (
      select 1 from public.orders o
      where o.id = order_events.order_id
        and o.customer_id = auth.uid()
    )
  );

-- Full edit of a pending order. Returns { order_id, subtotal_cents, changes }.
create or replace function public.admin_edit_order(
  p_order_id         uuid,
  p_items            jsonb,
  p_shipping_address jsonb default null,
  p_note             text  default null,
  p_reason           text  default null
) returns jsonb
  language plpgsql
  security definer
  set search_path to ''
as $function$
declare
  v_uid      uuid := auth.uid();
  v_role     text;
  v_order    public.orders;
  v_new_norm jsonb;
  v_old      jsonb;
  v_subtotal bigint := 0;
  v_changes  jsonb := '[]'::jsonb;
  v_name     text;
  rec        record;
begin
  if not public.is_admin_or_staff() then
    raise exception 'staff_only' using errcode = '42501';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty_order' using errcode = 'P0001';
  end if;

  select role::text into v_role from public.profiles where id = v_uid;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  if v_order.status <> 'pending' then
    raise exception 'order_not_pending' using errcode = 'P0001', detail = v_order.status::text;
  end if;

  -- Normalize incoming items: aggregate by variant (mirrors place_order), so a
  -- duplicated variant can't produce an ambiguous diff or double approval lines.
  select coalesce(jsonb_agg(jsonb_build_object(
           'variant_id', variant_id,
           'qty', qty,
           'unit_price_cents', unit_price_cents
         )), '[]'::jsonb)
    into v_new_norm
  from (
    select (e->>'variant_id')::uuid                 as variant_id,
           sum((e->>'qty')::int)::int               as qty,
           max((e->>'unit_price_cents')::bigint)     as unit_price_cents
    from jsonb_array_elements(p_items) e
    group by (e->>'variant_id')::uuid
  ) agg;

  -- Validation (money/stock guardrails: no zero/negative qty, no negative price).
  if exists (
    select 1 from jsonb_to_recordset(v_new_norm) as n(variant_id uuid, qty int, unit_price_cents bigint)
    where n.variant_id is null
  ) then
    raise exception 'bad_variant' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(v_new_norm) as n(variant_id uuid, qty int, unit_price_cents bigint)
    where n.qty is null or n.qty <= 0
  ) then
    raise exception 'bad_qty' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(v_new_norm) as n(variant_id uuid, qty int, unit_price_cents bigint)
    where n.unit_price_cents is null or n.unit_price_cents < 0
  ) then
    raise exception 'bad_price' using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(v_new_norm) as n(variant_id uuid, qty int, unit_price_cents bigint)
    left join public.product_variants pv on pv.id = n.variant_id
    where pv.id is null
  ) then
    raise exception 'unknown_variant' using errcode = 'P0001';
  end if;

  -- Snapshot the current lines (aggregated by variant) BEFORE mutating, so we can
  -- both diff and preserve requested_location_id for surviving variants.
  select coalesce(jsonb_agg(jsonb_build_object(
           'variant_id', variant_id,
           'qty', qty,
           'unit_price_cents', unit_price_cents,
           'requested_location_id', requested_location_id
         )), '[]'::jsonb)
    into v_old
  from (
    select variant_id,
           sum(qty_requested)::int                     as qty,
           max(unit_price_cents)                        as unit_price_cents,
           max(requested_location_id::text)::uuid       as requested_location_id
    from public.order_items
    where order_id = p_order_id
    group by variant_id
  ) s;

  select coalesce(sum(n.qty * n.unit_price_cents), 0)
    into v_subtotal
  from jsonb_to_recordset(v_new_norm) as n(variant_id uuid, qty int, unit_price_cents bigint);

  -- Build the human-readable diff (numbers stay numbers; prices are cents).
  for rec in
    select coalesce(o.variant_id, n.variant_id) as variant_id,
           o.qty as old_qty, o.unit_price_cents as old_price,
           n.qty as new_qty, n.unit_price_cents as new_price,
           pr.model, pv.capacity, pv.sku
    from jsonb_to_recordset(v_old) as o(variant_id uuid, qty int, unit_price_cents bigint, requested_location_id uuid)
    full outer join jsonb_to_recordset(v_new_norm) as n(variant_id uuid, qty int, unit_price_cents bigint)
      on n.variant_id = o.variant_id
    left join public.product_variants pv on pv.id = coalesce(o.variant_id, n.variant_id)
    left join public.products pr on pr.id = pv.product_id
  loop
    v_name := coalesce(rec.model, rec.sku, 'item')
              || case when rec.capacity is not null and rec.capacity <> '' then ' · ' || rec.capacity else '' end;
    if rec.old_qty is null then
      v_changes := v_changes || jsonb_build_object(
        'type', 'added', 'label', v_name, 'qty', rec.new_qty, 'price', rec.new_price);
    elsif rec.new_qty is null then
      v_changes := v_changes || jsonb_build_object(
        'type', 'removed', 'label', v_name, 'qty', rec.old_qty);
    else
      if rec.old_qty <> rec.new_qty then
        v_changes := v_changes || jsonb_build_object(
          'type', 'qty', 'label', v_name, 'from', rec.old_qty, 'to', rec.new_qty);
      end if;
      if rec.old_price <> rec.new_price then
        v_changes := v_changes || jsonb_build_object(
          'type', 'price', 'label', v_name, 'from', rec.old_price, 'to', rec.new_price);
      end if;
    end if;
  end loop;

  if p_shipping_address is not null
     and p_shipping_address is distinct from v_order.shipping_address then
    v_changes := v_changes || jsonb_build_object('type', 'address', 'label', 'Shipping address');
  end if;
  if p_note is not null
     and nullif(btrim(p_note), '') is distinct from v_order.notes then
    v_changes := v_changes || jsonb_build_object('type', 'note', 'label', 'Order note');
  end if;

  -- Replace lines. Nothing references order_items.id while pending (reconciliation
  -- rows only exist post-approval), so delete + re-insert is safe and atomic.
  delete from public.order_items where order_id = p_order_id;

  insert into public.order_items
    (order_id, variant_id, requested_location_id, qty_requested, unit_price_cents, tier)
  select p_order_id, n.variant_id, o.requested_location_id, n.qty, n.unit_price_cents, v_order.tier_at_order
  from jsonb_to_recordset(v_new_norm) as n(variant_id uuid, qty int, unit_price_cents bigint)
  left join jsonb_to_recordset(v_old) as o(variant_id uuid, qty int, unit_price_cents bigint, requested_location_id uuid)
    on o.variant_id = n.variant_id;

  update public.orders
     set subtotal_cents   = v_subtotal,
         shipping_address = coalesce(p_shipping_address, shipping_address),
         notes            = case when p_note is null then notes else nullif(btrim(p_note), '') end,
         updated_at       = now()
   where id = p_order_id;

  -- Only log when something actually changed.
  if jsonb_array_length(v_changes) > 0 then
    insert into public.order_events (order_id, actor_id, actor_role, kind, summary, changes)
    values (p_order_id, v_uid, coalesce(v_role, 'admin'), 'edited', nullif(btrim(p_reason), ''), v_changes);

    insert into public.audit_log (actor_id, action, entity_type, entity_id, payload)
    values (v_uid, 'order_edited', 'orders', p_order_id,
            jsonb_build_object('changes', v_changes, 'subtotal_cents', v_subtotal,
                               'reason', nullif(btrim(p_reason), '')));
  end if;

  return jsonb_build_object('order_id', p_order_id, 'subtotal_cents', v_subtotal, 'changes', v_changes);
end;
$function$;

grant execute on function public.admin_edit_order(uuid, jsonb, jsonb, text, text) to authenticated;
