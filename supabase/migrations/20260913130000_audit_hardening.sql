-- 20260913130000_audit_hardening.sql
-- Fixes from docs/planning/AUDIT-2026-09-13.md (P0-3, P0-4, P1-6..P1-12,
-- P1-14, P1-15, P1-18 + the perf advisor). Every section is independent;
-- read the audit for the "why" behind each one.

------------------------------------------------------------------
-- A. app_settings is admin-only to write (P0-4). Staff could flip
-- catalog_source (LIVE/Demo), reports_include_test, enforcement points…
------------------------------------------------------------------
drop policy if exists "app_settings admin write" on public.app_settings;
create policy "app_settings admin write" on public.app_settings
  for all to authenticated
  using ( (select public.is_admin()) )
  with check ( (select public.is_admin()) );

------------------------------------------------------------------
-- B. Finance/admin surfaces are admin-only (P1-11): sell prices, price
-- overrides, invites. Staff keeps read on prices (the console shows them)
-- and keeps approve/reject/import/reconcile.
------------------------------------------------------------------
drop policy if exists "prices staff write" on public.prices;
create policy "prices admin write" on public.prices
  for all to authenticated
  using ( (select public.is_admin()) )
  with check ( (select public.is_admin()) );

drop policy if exists "invites admin all" on public.invites;
create policy "invites admin all" on public.invites
  for all to authenticated
  using ( (select public.is_admin()) )
  with check ( (select public.is_admin()) );

create or replace function public.set_tier_price(p_variant_id uuid, p_tier public.customer_tier, p_price_cents bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  if p_price_cents is null then
    -- Hiding is an admin decision too: mark the row manual so the engine
    -- does not un-hide it on the next reprice (see section D).
    update public.prices set visible = false, source = 'manual', computed_at = now()
     where variant_id = p_variant_id and tier = p_tier;
    return;
  end if;
  if p_price_cents <= 0 then
    raise exception 'bad_price' using errcode = 'P0001';
  end if;
  insert into public.prices (variant_id, tier, price_cents, visible, source)
  values (p_variant_id, p_tier, p_price_cents, true, 'manual')
  on conflict (variant_id, tier) do update
    set price_cents = excluded.price_cents, visible = true, source = 'manual', computed_at = now();
end $$;

create or replace function public.create_invite(p_email text, p_tier public.customer_tier)
returns public.invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email  text := lower(trim(p_email));
  v_invite public.invites;
begin
  if not (select public.is_admin()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if v_email is null or v_email = '' or position('@' in v_email) = 0 then
    raise exception 'invalid_email' using errcode = '22023';
  end if;

  if exists (select 1 from auth.users u where lower(u.email) = v_email) then
    raise exception 'email_taken' using errcode = '23505';
  end if;

  insert into public.invites (email, tier, invited_by)
  values (v_email, p_tier, auth.uid())
  returning * into v_invite;

  return v_invite;
end;
$$;

-- resolve_pricing_flag: the 'override' action writes a sell price, so it is
-- admin-only; acknowledge/watch/resolve stay staff. Implemented as a thin
-- guard so the function body (20260807170000) stays the single definition.
create or replace function public.guard_pricing_override()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'overridden'::public.pricing_flag_status
     and old.status is distinct from new.status
     and current_setting('role', true) = 'authenticated'
     and not (select public.is_admin()) then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_guard_pricing_override on public.pricing_flags;
create trigger trg_guard_pricing_override
  before update of status on public.pricing_flags
  for each row execute function public.guard_pricing_override();
revoke execute on function public.guard_pricing_override() from public, anon, authenticated;

------------------------------------------------------------------
-- C. inventory is ledger-authoritative (P1-12): nobody writes qty
-- directly. Every legitimate writer is SECURITY DEFINER (the movement
-- trigger, commit_stock_import, merge_locations, reset_test_data).
------------------------------------------------------------------
drop policy if exists "inventory staff write" on public.inventory;
revoke insert, update, delete on public.inventory from authenticated;

------------------------------------------------------------------
-- D. Manual / override prices survive a reprice (P1-14). reprice_variants
-- (20260807150000) unconditionally upserts T2–T4 with source='engine';
-- this BEFORE UPDATE trigger keeps an admin-authored number in place.
-- Out-of-stock still hides the row (the engine's zero_qty path changes
-- only visible/flag_reason, not source, so the guard does not fire) and a
-- restock re-shows it.
------------------------------------------------------------------
create or replace function public.prices_protect_manual()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.source in ('manual', 'override') and new.source = 'engine' then
    new.price_cents := old.price_cents;
    new.source      := old.source;
    if old.flag_reason is distinct from 'zero_qty' then
      -- Keep the admin's visibility decision; the engine's flag reasons
      -- describe ITS price, not this one.
      new.visible     := old.visible;
      new.flag_reason := old.flag_reason;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_prices_protect_manual on public.prices;
create trigger trg_prices_protect_manual
  before update on public.prices
  for each row execute function public.prices_protect_manual();
revoke execute on function public.prices_protect_manual() from public, anon, authenticated;

------------------------------------------------------------------
-- E. Order lines can never be priced at zero (P1-15). place_order captures
-- server prices (> 0 by construction); admin_edit_order only rejected < 0.
-- A table constraint covers both paths. 0 existing rows violate it.
------------------------------------------------------------------
alter table public.order_items drop constraint if exists order_items_unit_price_positive;
alter table public.order_items add constraint order_items_unit_price_positive check (unit_price_cents > 0);

------------------------------------------------------------------
-- F. Function grant hygiene (P1-18, security advisor): nothing SECURITY
-- DEFINER is executable by PUBLIC/anon unless it is meant to be.
------------------------------------------------------------------
revoke execute on function public.admin_edit_order(uuid, jsonb, jsonb, text, text) from public, anon;
revoke execute on function public.suppress_unbenchmarked_flag() from public, anon, authenticated;
revoke execute on function public.addresses_enforce_default() from public, anon, authenticated;
revoke execute on function public.addresses_promote_after_delete() from public, anon, authenticated;

------------------------------------------------------------------
-- G. Sub-accounts (P0-3, P1-6..9).
------------------------------------------------------------------
-- G1. Foreign keys: an owner can be deleted (its shared book goes with it,
-- its invites detach); deleting a sub-login never deletes rows it added to
-- the OWNER's shared book (user_id is audit-only).
alter table public.addresses drop constraint if exists addresses_account_id_fkey;
alter table public.addresses
  add constraint addresses_account_id_fkey foreign key (account_id) references public.profiles(id) on delete cascade;

alter table public.invites drop constraint if exists invites_parent_account_id_fkey;
alter table public.invites
  add constraint invites_parent_account_id_fkey foreign key (parent_account_id) references public.profiles(id) on delete set null;

alter table public.addresses alter column user_id drop not null;
alter table public.addresses drop constraint if exists addresses_user_id_fkey;
alter table public.addresses
  add constraint addresses_user_id_fkey foreign key (user_id) references auth.users(id) on delete set null;

-- G2. An owner may only move its own PENDING sub-account invite to revoked.
drop policy if exists "invites owner revoke own sub account invites" on public.invites;
create policy "invites owner revoke own sub account invites" on public.invites
  for update to authenticated
  using ( parent_account_id = (select auth.uid()) and status = 'pending' )
  with check ( parent_account_id = (select auth.uid()) and status = 'revoked' );

-- G3. Inheritance is maintained, not one-shot: a sub-account's tier/is_test
-- always re-copy from the owner (so nobody can set them on the child), and
-- an owner's change propagates down. An owner with sub-accounts cannot drop
-- below wholesale — remove the sub-accounts first.
drop trigger if exists trg_enforce_sub_account_parent on public.profiles;
create trigger trg_enforce_sub_account_parent
  before insert or update of parent_account_id, tier, is_test on public.profiles
  for each row execute function public.enforce_sub_account_parent();

create or replace function public.propagate_account_flags()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.parent_account_id is not null then
    return null; -- a sub-account never propagates
  end if;
  if new.tier is distinct from old.tier or new.is_test is distinct from old.is_test then
    if (new.tier is null or new.tier not in ('wholesale', 'distributor'))
       and exists (select 1 from public.profiles c where c.parent_account_id = new.id) then
      raise exception 'account has sub-accounts: remove them before moving it below wholesale'
        using errcode = '23514';
    end if;
    update public.profiles
       set tier = new.tier, is_test = new.is_test, updated_at = now()
     where parent_account_id = new.id
       and (tier is distinct from new.tier or is_test is distinct from new.is_test);
  end if;
  return null;
end;
$$;
drop trigger if exists trg_propagate_account_flags on public.profiles;
create trigger trg_propagate_account_flags
  after update of tier, is_test on public.profiles
  for each row execute function public.propagate_account_flags();
revoke execute on function public.propagate_account_flags() from public, anon, authenticated;

-- set_customer_tier: refuse sub-account targets explicitly (the trigger
-- would silently re-copy the owner's tier and the audit row would lie).
create or replace function public.set_customer_tier(p_user_id uuid, p_tier public.customer_tier, p_reason text default null)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row    public.profiles;
  v_old    public.customer_tier;
  v_role   public.user_role;
  v_parent uuid;
begin
  if not (select public.is_admin()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_tier is null then
    raise exception 'tier is required';
  end if;

  select role, tier, parent_account_id into v_role, v_old, v_parent from public.profiles where id = p_user_id;
  if not found then
    raise exception 'unknown user %', p_user_id;
  end if;
  if v_role <> 'customer'::public.user_role then
    raise exception 'only customer accounts carry a tier (user role is %)', v_role;
  end if;
  if v_parent is not null then
    raise exception 'sub_account_inherits_tier' using errcode = '23514',
      detail = 'This login is a sub-account; change the tier on its account owner instead.';
  end if;

  update public.profiles
     set tier = p_tier, updated_at = now()
   where id = p_user_id
  returning * into v_row;

  insert into public.admin_audit (actor_id, action, target_user_id, detail)
  values (auth.uid(), 'set_customer_tier', p_user_id,
          jsonb_build_object('from', v_old, 'to', p_tier, 'reason', p_reason));

  return v_row;
end;
$$;

-- G4. remove_sub_account(p_id) — owner (or admin) detaches a sub-login:
-- it leaves the account (no tier → no prices, no shared book), the auth
-- user is banned for good and every live session is revoked. Orders it
-- placed stay on record (orders.customer_id is ON DELETE RESTRICT anyway).
create or replace function public.remove_sub_account(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_target public.profiles;
begin
  select * into v_target from public.profiles where id = p_id for update;
  if not found or v_target.parent_account_id is null then
    raise exception 'not_a_sub_account' using errcode = '22023';
  end if;
  if not (v_target.parent_account_id = v_caller or (select public.is_admin())) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.profiles
     set parent_account_id = null, tier = null, updated_at = now()
   where id = p_id;

  update auth.users
     set banned_until = 'infinity'::timestamptz, updated_at = now()
   where id = p_id;
  delete from auth.sessions where user_id = p_id; -- refresh tokens cascade

  insert into public.admin_audit (actor_id, action, target_user_id, detail)
  values (v_caller, 'remove_sub_account', p_id,
          jsonb_build_object('owner', v_target.parent_account_id, 'email', v_target.email));
end;
$$;
revoke execute on function public.remove_sub_account(uuid) from public, anon, authenticated;
grant  execute on function public.remove_sub_account(uuid) to authenticated;

-- G5. Account-wide order visibility (P1-10): the owner sees every order
-- placed under its account; sub-accounts still see only their own.
drop policy if exists "orders own read" on public.orders;
create policy "orders own read" on public.orders for select to authenticated
  using (
    customer_id = (select auth.uid())
    or (select public.is_admin_or_staff())
    or customer_id in (select c.id from public.profiles c where c.parent_account_id = (select auth.uid()))
  );

drop policy if exists "order items own read" on public.order_items;
create policy "order items own read" on public.order_items for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and (
          o.customer_id = (select auth.uid())
          or (select public.is_admin_or_staff())
          or o.customer_id in (select c.id from public.profiles c where c.parent_account_id = (select auth.uid()))
        )
    )
  );

create or replace view public.my_order_items
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
         pv.carrier as carrier_code,
         pv.lock_status,
         oi.requested_location_id,
         rl.display_name as requested_location_name
    from public.order_items oi
    join public.product_variants pv on pv.id = oi.variant_id
    join public.products p on p.id = pv.product_id
    join public.orders o on o.id = oi.order_id
    left join public.stock_locations rl on rl.id = oi.requested_location_id
   where o.customer_id = (select auth.uid())
      or (select public.is_admin_or_staff())
      or o.customer_id in (select c.id from public.profiles c where c.parent_account_id = (select auth.uid()));

-- order_events: same account scope + the (select …) initplan fix the
-- performance advisor asked for.
drop policy if exists order_events_read on public.order_events;
create policy order_events_read on public.order_events
  for select to authenticated
  using (
    (select public.is_admin_or_staff())
    or exists (
      select 1 from public.orders o
      where o.id = order_events.order_id
        and (
          o.customer_id = (select auth.uid())
          or o.customer_id in (select c.id from public.profiles c where c.parent_account_id = (select auth.uid()))
        )
    )
  );

------------------------------------------------------------------
-- H. Indexes for the hot-path foreign keys the performance advisor lists.
------------------------------------------------------------------
create index if not exists order_items_variant_id_idx            on public.order_items (variant_id);
create index if not exists order_items_location_id_idx           on public.order_items (location_id);
create index if not exists order_items_requested_location_id_idx on public.order_items (requested_location_id);
create index if not exists inventory_location_id_idx             on public.inventory (location_id);
create index if not exists stock_movements_location_id_idx       on public.stock_movements (location_id);
create index if not exists reconciliation_queue_order_item_idx   on public.reconciliation_queue (order_item_id);
create index if not exists reconciliation_queue_variant_idx      on public.reconciliation_queue (variant_id);
create index if not exists orders_customer_id_idx                on public.orders (customer_id);
