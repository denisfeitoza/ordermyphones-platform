-- Tier progress by volume (RFC-001 Phase C): lifetime approved units (approved
-- / partially approved / shipped orders, test orders excluded) across the
-- account owner and its sub-accounts, against unit bands stored in
-- app_settings.tier_volume_bands (default: retailer from 10, wholesale from
-- 50, distributor from 401 units). Upgrades stay a staff decision: nothing
-- changes a tier automatically and nothing ever downgrades.
insert into public.app_settings (key, value)
values ('tier_volume_bands', '{"retailer": 10, "wholesale": 50, "distributor": 401}'::jsonb)
on conflict (key) do nothing;

create or replace function public.account_units_bought(p_owner uuid)
returns bigint
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(sum(oi.qty_approved), 0)::bigint
    from public.orders o
    join public.profiles p on p.id = o.customer_id
    join public.order_items oi on oi.order_id = o.id
   where coalesce(p.parent_account_id, p.id) = p_owner
     and o.status in ('approved', 'partially_approved', 'shipped')
     and not o.is_test
$$;
revoke all on function public.account_units_bought(uuid) from public, anon, authenticated;

create or replace function public.volume_tier(p_units bigint)
returns text
language sql
stable
security definer
set search_path to ''
as $$
  select case
    when p_units >= coalesce((b->>'distributor')::bigint, 401) then 'distributor'
    when p_units >= coalesce((b->>'wholesale')::bigint, 50) then 'wholesale'
    when p_units >= coalesce((b->>'retailer')::bigint, 10) then 'retailer'
    else 'consumer' end
  from (select coalesce((select value from public.app_settings where key = 'tier_volume_bands'), '{}'::jsonb) as b) s
$$;
revoke all on function public.volume_tier(bigint) from public, anon, authenticated;

-- The signed-in buyer: units bought, current tier, the tier the volume earns.
create or replace function public.my_tier_progress()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare v_owner uuid := public.current_account_id(); v_units bigint; v_tier text;
begin
  if v_owner is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select tier::text into v_tier from public.profiles where id = v_owner;
  v_units := public.account_units_bought(v_owner);
  return jsonb_build_object('units', v_units, 'tier', v_tier, 'volume_tier', public.volume_tier(v_units),
                            'bands', coalesce((select value from public.app_settings where key = 'tier_volume_bands'), '{}'::jsonb));
end;
$$;

-- Staff: accounts whose volume earns a higher tier than they have.
create or replace function public.tier_upgrade_candidates()
returns table (account_id uuid, email text, display_name text, tier text, units bigint, volume_tier text)
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if not public.is_admin_or_staff() then raise exception 'staff_only' using errcode = '42501'; end if;
  return query
  with a as (
    select p.id, p.email, p.display_name, p.tier::text as tier, public.account_units_bought(p.id) as units
      from public.profiles p where p.role = 'customer' and p.parent_account_id is null and not p.is_test
  )
  select a.id, a.email, a.display_name, a.tier, a.units, public.volume_tier(a.units)
    from a
   where array_position(array['consumer', 'retailer', 'wholesale', 'distributor'], public.volume_tier(a.units))
       > coalesce(array_position(array['consumer', 'retailer', 'wholesale', 'distributor'], a.tier), 0)
   order by a.units desc;
end;
$$;

revoke all on function public.my_tier_progress() from public, anon;
revoke all on function public.tier_upgrade_candidates() from public, anon;
grant execute on function public.my_tier_progress() to authenticated;
grant execute on function public.tier_upgrade_candidates() to authenticated;
