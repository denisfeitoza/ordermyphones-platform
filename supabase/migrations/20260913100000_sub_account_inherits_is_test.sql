-- 20260913100000_sub_account_inherits_is_test.sql
-- A sub-account is part of its owner's account, so it must carry the owner's
-- `is_test` flag: otherwise a rehearsal owner's sub-login places orders that
-- reports treat as real (orders.is_test is snapshotted from the profile at
-- place_order) and that reset_test_data() will not touch. Found while
-- redeeming a sub-account invite from a test owner in the browser
-- (2026-09-13): the new profile landed with is_test=false.
--
-- Same trigger as 20260911100000 section B — extended, not duplicated — so
-- the inheritance applies on INSERT and on any later re-parenting.

create or replace function public.enforce_sub_account_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent public.profiles;
begin
  if new.parent_account_id is null then
    return new;
  end if;

  if new.parent_account_id = new.id then
    raise exception 'a profile cannot be its own parent account' using errcode = '22023';
  end if;

  select * into v_parent from public.profiles where id = new.parent_account_id;

  if not found then
    raise exception 'parent_account_id does not reference an existing profile' using errcode = '23503';
  end if;

  if v_parent.parent_account_id is not null then
    raise exception 'sub-accounts cannot themselves have sub-accounts' using errcode = '22023';
  end if;

  if v_parent.tier is null or v_parent.tier not in ('wholesale', 'distributor') then
    raise exception 'only wholesale and distributor accounts can have sub-accounts' using errcode = '22023';
  end if;

  -- Inherit the account-level flags from the owner.
  new.is_test := v_parent.is_test;
  new.tier := v_parent.tier;

  return new;
end;
$$;

-- Backfill any sub-account created before this rule.
update public.profiles s
   set is_test = o.is_test
  from public.profiles o
 where s.parent_account_id = o.id
   and s.is_test is distinct from o.is_test;
