-- Payment terms, credit and payment status (RFC-001 D1/D2: no card gateway
-- before Nov 15; wholesale/distributor pay COD, cash in advance by ACH/wire,
-- or Net 7/10/15/30, set per account by staff).
--  * account_terms: staff-write, customer-read-own, keyed by account owner.
--    Never on profiles (customers can update their own profile row).
--  * orders: payment_terms snapshot, invoice/due dates, paid state, and the
--    shipping fields (method, buyer carrier account, cost, label stage).
--    Shipping cost stays out of subtotal_cents (goods total everywhere).
--  * place_order_core/place_order/place_order_for gain p_shipping; the old
--    signatures are dropped so PostgREST never sees two overloads.
--  * approve_order adds credit problems to the soft gate (override works);
--    sets invoiced_at and due_at. mark_order_shipped refuses cash-in-advance
--    orders until paid and customer-label orders until the label is in.
--  * mark_order_paid / mark_order_unpaid, set_account_terms, my_account_summary.

create table public.account_terms (
  account_id                    uuid primary key references public.profiles(id) on delete cascade,
  payment_terms                 text not null default 'cia'
                                check (payment_terms in ('cod', 'cia', 'net7', 'net10', 'net15', 'net30')),
  credit_limit_cents            bigint check (credit_limit_cents is null or credit_limit_cents >= 0),
  auction_deposit_required      boolean not null default true,
  auction_deposit_received_cents bigint not null default 0 check (auction_deposit_received_cents >= 0),
  updated_at                    timestamptz not null default now(),
  updated_by                    uuid references public.profiles(id)
);
alter table public.account_terms enable row level security;
create policy account_terms_read on public.account_terms for select to authenticated
  using (account_id = (select public.current_account_id()) or (select public.is_admin_or_staff()));
create policy account_terms_staff_write on public.account_terms for all to authenticated
  using ((select public.is_admin_or_staff())) with check ((select public.is_admin_or_staff()));
grant select, insert, update on public.account_terms to authenticated;
revoke all on public.account_terms from anon;

alter table public.orders
  add column payment_terms     text check (payment_terms is null or payment_terms in ('cod', 'cia', 'net7', 'net10', 'net15', 'net30')),
  add column payment_status    text not null default 'unpaid' check (payment_status in ('unpaid', 'paid')),
  add column invoiced_at       timestamptz,
  add column due_at            timestamptz,
  add column paid_at           timestamptz,
  add column paid_by           uuid references public.profiles(id),
  add column payment_reference text check (payment_reference is null or length(payment_reference) <= 120),
  add column shipping_method   text not null default 'omp' check (shipping_method in ('omp', 'customer_account', 'customer_label')),
  add column shipping_account  jsonb,
  add column shipping_cents    bigint not null default 0 check (shipping_cents >= 0 and shipping_cents <= 10000000),
  add column shipping_stage    text not null default 'none' check (shipping_stage in ('none', 'awaiting_label', 'label_received')),
  add column package           jsonb,
  add column label_path        text;

-- Open credit problems for an order (approval soft gate). Cash in advance
-- uses no credit. COD and Net need a credit limit set by staff; the open
-- balance (unpaid approved goods + shipping across the owner and its
-- sub-accounts) plus this order must fit; any overdue invoice blocks.
create or replace function public.order_credit_problems(p_order_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_order public.orders;
  v_owner uuid;
  v_limit bigint;
  v_terms text;
  v_open  bigint;
  v_this  bigint;
  v_out   text[] := '{}';
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then return v_out; end if;
  v_terms := coalesce(v_order.payment_terms, 'cia');
  if v_terms = 'cia' then return v_out; end if;

  select coalesce(p.parent_account_id, p.id) into v_owner from public.profiles p where p.id = v_order.customer_id;
  select credit_limit_cents into v_limit from public.account_terms where account_id = v_owner;

  if exists (
    select 1 from public.orders o join public.profiles p on p.id = o.customer_id
     where coalesce(p.parent_account_id, p.id) = v_owner
       and o.status in ('approved', 'partially_approved', 'shipped')
       and o.payment_status = 'unpaid' and o.due_at < now()
  ) then
    v_out := array_append(v_out, 'overdue_invoices');
  end if;

  if v_limit is null then
    return array_append(v_out, 'credit_limit_missing');
  end if;

  select coalesce(sum(oi.qty_approved::bigint * oi.unit_price_cents), 0) + coalesce((
           select sum(o2.shipping_cents) from public.orders o2 join public.profiles p2 on p2.id = o2.customer_id
            where coalesce(p2.parent_account_id, p2.id) = v_owner
              and o2.status in ('approved', 'partially_approved', 'shipped') and o2.payment_status = 'unpaid'), 0)
    into v_open
    from public.orders o join public.profiles p on p.id = o.customer_id
    join public.order_items oi on oi.order_id = o.id
   where coalesce(p.parent_account_id, p.id) = v_owner
     and o.status in ('approved', 'partially_approved', 'shipped')
     and o.payment_status = 'unpaid';
  v_this := v_order.subtotal_cents;
  if v_open + v_this > v_limit then
    v_out := array_append(v_out, 'credit_limit_exceeded');
  end if;
  return v_out;
end;
$$;
revoke all on function public.order_credit_problems(uuid) from public, anon, authenticated;

drop function if exists public.place_order(jsonb, jsonb, text, uuid);
drop function if exists public.place_order_for(uuid, jsonb, jsonb, text, uuid, boolean);
drop function if exists public.place_order_core(uuid, uuid, jsonb, jsonb, text, uuid, boolean);

create or replace function public.place_order_core(p_customer uuid, p_actor uuid, p_items jsonb, p_shipping_address jsonb, p_note text, p_client_ref uuid, p_override_requirements boolean, p_shipping jsonb)
 RETURNS orders
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
  v_owner    uuid;
  v_terms    text;
  v_ship     text := coalesce(nullif(p_shipping->>'method', ''), 'omp');
  v_ship_acct jsonb;
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

  -- Payment terms are the account owner's (sub-accounts buy on the owner's
  -- terms); snapshotted on the order so a later change never rewrites it.
  select coalesce(p.parent_account_id, p.id) into v_owner from public.profiles p where p.id = v_uid;
  select t.payment_terms into v_terms from public.account_terms t where t.account_id = v_owner;
  v_terms := coalesce(v_terms, 'cia');

  -- Shipping: OMP ships (default); the buyer's own carrier account; or the
  -- buyer sends a label after OMP packs. Consumers (T1) only get OMP shipping.
  if v_ship not in ('omp', 'customer_account', 'customer_label') then
    raise exception 'bad_shipping' using errcode = 'P0001';
  end if;
  if v_ship <> 'omp' and v_tier = 'consumer' then
    raise exception 'bad_shipping' using errcode = 'P0001';
  end if;
  if v_ship = 'customer_account' then
    if coalesce(btrim(p_shipping->>'carrier'), '') = '' or coalesce(btrim(p_shipping->>'account_number'), '') = ''
       or length(p_shipping->>'carrier') > 40 or length(p_shipping->>'account_number') > 60 then
      raise exception 'bad_shipping_account' using errcode = 'P0001';
    end if;
    v_ship_acct := jsonb_build_object('carrier', btrim(p_shipping->>'carrier'), 'account_number', btrim(p_shipping->>'account_number'));
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
                               shipping_address, notes, is_test, client_ref,
                               payment_terms, shipping_method, shipping_account)
    values (v_uid, 'pending', v_tier, 0,
            p_shipping_address, nullif(btrim(p_note), ''), coalesce(v_is_test, false), p_client_ref,
            v_terms, v_ship, v_ship_acct)
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

revoke all on function public.place_order_core(uuid, uuid, jsonb, jsonb, text, uuid, boolean, jsonb) from public, anon, authenticated;

create or replace function public.place_order(p_items jsonb, p_shipping_address jsonb default null, p_note text default null,
                                              p_client_ref uuid default null, p_shipping jsonb default null)
returns public.orders
language plpgsql
security definer
set search_path to ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  return public.place_order_core(auth.uid(), auth.uid(), p_items, p_shipping_address, p_note, p_client_ref, false, p_shipping);
end;
$$;

create or replace function public.place_order_for(
  p_customer_id uuid,
  p_items jsonb,
  p_shipping_address jsonb default null,
  p_note text default null,
  p_client_ref uuid default null,
  p_override_requirements boolean default false,
  p_shipping jsonb default null
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
  return public.place_order_core(p_customer_id, auth.uid(), p_items, p_shipping_address, p_note, p_client_ref, p_override_requirements, p_shipping);
end;
$$;

revoke all on function public.place_order(jsonb, jsonb, text, uuid, jsonb) from public, anon;
grant execute on function public.place_order(jsonb, jsonb, text, uuid, jsonb) to authenticated;
revoke all on function public.place_order_for(uuid, jsonb, jsonb, text, uuid, boolean, jsonb) from public, anon;
grant execute on function public.place_order_for(uuid, jsonb, jsonb, text, uuid, boolean, jsonb) to authenticated;

create or replace function public.mark_order_paid(p_order_id uuid, p_reference text default null, p_paid_on date default null)
returns public.orders
language plpgsql
security definer
set search_path to ''
as $$
declare v_uid uuid := auth.uid(); v_order public.orders; v_role text;
begin
  if v_uid is null or not public.is_admin_or_staff() then
    raise exception 'staff_only' using errcode = '42501';
  end if;
  if p_reference is not null and length(p_reference) > 120 then
    raise exception 'bad_reference' using errcode = 'P0001';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0001'; end if;
  if v_order.status not in ('approved', 'partially_approved', 'shipped') then
    raise exception 'order_not_approved' using errcode = 'P0001', detail = v_order.status::text;
  end if;
  update public.orders
     set payment_status = 'paid', paid_at = coalesce(p_paid_on::timestamptz, now()), paid_by = v_uid,
         payment_reference = nullif(btrim(p_reference), ''), updated_at = now()
   where id = p_order_id returning * into v_order;
  select role::text into v_role from public.profiles where id = v_uid;
  insert into public.order_events (order_id, actor_id, actor_role, kind, summary, changes)
  values (p_order_id, v_uid, coalesce(v_role, 'staff'), 'paid', nullif(btrim(p_reference), ''),
          jsonb_build_array(jsonb_build_object('type', 'paid', 'label', 'Payment received')));
  insert into public.audit_log (actor_id, action, entity_type, entity_id, payload)
  values (v_uid, 'order_paid', 'orders', p_order_id, jsonb_build_object('reference', v_order.payment_reference, 'paid_at', v_order.paid_at));
  return v_order;
end;
$$;

create or replace function public.mark_order_unpaid(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path to ''
as $$
declare v_uid uuid := auth.uid(); v_order public.orders;
begin
  if v_uid is null or not public.is_admin_or_staff() then
    raise exception 'staff_only' using errcode = '42501';
  end if;
  update public.orders set payment_status = 'unpaid', paid_at = null, paid_by = null, payment_reference = null, updated_at = now()
   where id = p_order_id returning * into v_order;
  if not found then raise exception 'order_not_found' using errcode = 'P0001'; end if;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, payload)
  values (v_uid, 'order_unpaid', 'orders', p_order_id, '{}'::jsonb);
  return v_order;
end;
$$;

create or replace function public.set_account_terms(p_account_id uuid, p_terms text, p_credit_limit_cents bigint, p_deposit_required boolean default null)
returns public.account_terms
language plpgsql
security definer
set search_path to ''
as $$
declare v_uid uuid := auth.uid(); v_row public.account_terms; v_owner uuid;
begin
  if v_uid is null or not public.is_admin_or_staff() then
    raise exception 'staff_only' using errcode = '42501';
  end if;
  select coalesce(parent_account_id, id) into v_owner from public.profiles where id = p_account_id and role = 'customer';
  if v_owner is null then raise exception 'customer_not_found' using errcode = 'P0001'; end if;
  if p_terms not in ('cod', 'cia', 'net7', 'net10', 'net15', 'net30') then raise exception 'bad_terms' using errcode = 'P0001'; end if;
  if p_credit_limit_cents is not null and (p_credit_limit_cents < 0 or p_credit_limit_cents > 100000000000) then
    raise exception 'bad_credit_limit' using errcode = 'P0001';
  end if;
  insert into public.account_terms (account_id, payment_terms, credit_limit_cents, auction_deposit_required, updated_at, updated_by)
  values (v_owner, p_terms, p_credit_limit_cents, coalesce(p_deposit_required, true), now(), v_uid)
  on conflict (account_id) do update
    set payment_terms = excluded.payment_terms, credit_limit_cents = excluded.credit_limit_cents,
        auction_deposit_required = coalesce(p_deposit_required, public.account_terms.auction_deposit_required),
        updated_at = now(), updated_by = v_uid
  returning * into v_row;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, payload)
  values (v_uid, 'account_terms_set', 'profiles', v_owner,
          jsonb_build_object('terms', p_terms, 'credit_limit_cents', p_credit_limit_cents, 'deposit_required', v_row.auction_deposit_required));
  return v_row;
end;
$$;

-- The signed-in buyer's terms, limit, open balance and overdue total.
create or replace function public.my_account_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare v_owner uuid := public.current_account_id(); v_t public.account_terms; v_open bigint; v_overdue bigint;
begin
  if v_owner is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into v_t from public.account_terms where account_id = v_owner;
  with o as (
    select o.id, o.due_at, o.shipping_cents,
           (select coalesce(sum(oi.qty_approved::bigint * oi.unit_price_cents), 0) from public.order_items oi where oi.order_id = o.id) as goods
      from public.orders o join public.profiles p on p.id = o.customer_id
     where coalesce(p.parent_account_id, p.id) = v_owner
       and o.status in ('approved', 'partially_approved', 'shipped') and o.payment_status = 'unpaid'
  )
  select coalesce(sum(goods + shipping_cents), 0), coalesce(sum(goods + shipping_cents) filter (where due_at < now()), 0)
    into v_open, v_overdue from o;
  return jsonb_build_object(
    'payment_terms', coalesce(v_t.payment_terms, 'cia'),
    'credit_limit_cents', v_t.credit_limit_cents,
    'open_balance_cents', v_open,
    'overdue_cents', v_overdue,
    'auction_deposit_required', coalesce(v_t.auction_deposit_required, true),
    'auction_deposit_received_cents', coalesce(v_t.auction_deposit_received_cents, 0));
end;
$$;

revoke all on function public.mark_order_paid(uuid, text, date) from public, anon;
revoke all on function public.mark_order_unpaid(uuid) from public, anon;
revoke all on function public.set_account_terms(uuid, text, bigint, boolean) from public, anon;
revoke all on function public.my_account_summary() from public, anon;
grant execute on function public.mark_order_paid(uuid, text, date) to authenticated;
grant execute on function public.mark_order_unpaid(uuid) to authenticated;
grant execute on function public.set_account_terms(uuid, text, bigint, boolean) to authenticated;
grant execute on function public.my_account_summary() to authenticated;

create or replace function public.approve_order(p_order_id uuid, p_override_requirements boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
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
  v_terms          text;
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
  v_missing := public.order_requirements_missing(v_order.customer_id, 'approval', v_order.shipping_address)
               || public.order_credit_problems(p_order_id);
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
      select inv.location_id, inv.qty, inv.unit_cost_cents
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
                                             ref_type, ref_id, unit_cost_cents, actor_id, note)
        values (v_item.variant_id, v_loc.location_id, -v_take, 'order_approval',
                'orders', p_order_id, v_loc.unit_cost_cents, v_uid, 'order approval');
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
         decided_by = v_uid,
         -- Approval issues the Sales Order: invoice date now, due date by terms
         -- (cash in advance: due now; COD: set when it ships).
         invoiced_at = now(),
         due_at = case coalesce(v_order.payment_terms, 'cia')
                    when 'cia'   then now()
                    when 'net7'  then now() + interval '7 days'
                    when 'net10' then now() + interval '10 days'
                    when 'net15' then now() + interval '15 days'
                    when 'net30' then now() + interval '30 days'
                    else null end
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

create or replace function public.mark_order_shipped(p_order_id uuid, p_carrier text DEFAULT NULL::text, p_tracking text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_close_shortfalls boolean DEFAULT false)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
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

  -- Cash in advance: nothing leaves before the money is in.
  if coalesce(v_order.payment_terms, 'legacy') = 'cia' and v_order.payment_status <> 'paid' then
    raise exception 'payment_required' using errcode = 'P0001';
  end if;
  -- The buyer sends the label after OMP packs: wait for it.
  if v_order.shipping_method = 'customer_label' and v_order.shipping_stage <> 'label_received' then
    raise exception 'label_required' using errcode = 'P0001';
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
         due_at           = case when payment_terms = 'cod' then now() else due_at end,
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
