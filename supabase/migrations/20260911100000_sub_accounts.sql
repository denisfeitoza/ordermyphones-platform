-- 20260911100000_sub_accounts.sql
-- Distributor/Wholesale sub-accounts: a Tier 3 (wholesale) or Tier 4
-- (distributor) profile — the "account owner" — can invite additional logins
-- ("sub-accounts") under itself, and the whole account (owner + its
-- sub-accounts) shares one address book instead of each login keeping its
-- own private one.
--
-- There is no pre-existing `accounts`/`account_memberships` layer in this
-- schema (docs/architecture/AUTH-AND-RLS.md explicitly disclaims the old,
-- never-applied draft that looked like that). Today a `profiles` row IS the
-- account. Rather than introduce a whole new entity, a sub-account is just
-- another `profiles` row that points at its owner via `parent_account_id` —
-- the owner's own id doubles as the account id. This is the FIRST
-- multi-user-per-row RLS pattern in this project; every new predicate below
-- follows the existing conventions (`to authenticated`, role helpers
-- `(select ...)`-wrapped, RLS altered in place rather than bolted on later).
--
-- Policy call convention (matches every prior migration in this project):
--   using ( account_id = (select public.current_account_id()) ), always
--   `to authenticated` so `anon` short-circuits.

------------------------------------------------------------------
-- A. profiles.parent_account_id — null for a normal profile or an account
-- owner; set to the owner's id for a sub-account. No grandchildren: a
-- sub-account can never itself become a parent (enforced by the trigger in
-- section B).
------------------------------------------------------------------
alter table public.profiles
  add column if not exists parent_account_id uuid references public.profiles(id) on delete cascade;

create index if not exists profiles_parent_account_idx on public.profiles (parent_account_id);

------------------------------------------------------------------
-- B. Invariant trigger: parent_account_id may only point at a profile that
-- (a) is not itself a sub-account, and (b) is tier wholesale/distributor.
-- Fires on INSERT and on UPDATE OF parent_account_id specifically, so it
-- also re-validates the assignment redeem_invite performs below.
------------------------------------------------------------------
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

  return new;
end;
$$;

drop trigger if exists trg_enforce_sub_account_parent on public.profiles;
create trigger trg_enforce_sub_account_parent
  before insert or update of parent_account_id on public.profiles
  for each row execute function public.enforce_sub_account_parent();

revoke execute on function public.enforce_sub_account_parent() from public, anon, authenticated;

------------------------------------------------------------------
-- C. Leg 2 (guard_profile_privileged_columns) drift: fold parent_account_id
-- into the same admin-managed column list as role/is_test/tier. Leg 1 (the
-- profiles column grant below) is what actually stops a customer self-
-- assigning into someone else's account; this is the belt-and-suspenders
-- catch, same rationale as the original migration.
------------------------------------------------------------------
create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_user = 'authenticated'
     and ( new.role               is distinct from old.role
        or new.is_test            is distinct from old.is_test
        or new.tier               is distinct from old.tier
        or new.parent_account_id  is distinct from old.parent_account_id ) then
    raise exception 'profiles.role, profiles.is_test, profiles.tier and profiles.parent_account_id are admin-managed columns'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Leg 1: parent_account_id was never in the granted column list added by
-- 20260806120000 (`grant update (display_name, phone, locale) ...`), so
-- `authenticated` already cannot move it directly — Leg 2 above is the only
-- change needed to keep both legs in sync.

------------------------------------------------------------------
-- D. current_account_id() / is_account_owner() — the two role helpers this
-- feature adds, following the exact shape of current_customer_tier() /
-- is_admin_or_staff() (language sql, stable, security definer, empty
-- search_path, revoked from public/anon/authenticated then re-granted only
-- to authenticated).
------------------------------------------------------------------
create or replace function public.current_account_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p.parent_account_id, p.id)
  from public.profiles p
  where p.id = auth.uid()
$$;

create or replace function public.is_account_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and parent_account_id is null
      and tier in ('wholesale', 'distributor')
  )
$$;

revoke execute on function public.current_account_id() from public, anon, authenticated;
revoke execute on function public.is_account_owner()    from public, anon, authenticated;

grant execute on function public.current_account_id() to authenticated;
grant execute on function public.is_account_owner()    to authenticated;

------------------------------------------------------------------
-- E. profiles RLS: an account owner may see (but not directly write — no
-- update policy is added) the profile rows of its own sub-accounts.
------------------------------------------------------------------
create policy "profiles select own sub accounts" on public.profiles
  for select to authenticated
  using ( parent_account_id = (select auth.uid()) );

------------------------------------------------------------------
-- F. invites: add parent_account_id (null for a normal admin/staff invite;
-- set to the owner's id for a sub-account invite) and let an owner read/
-- revoke exactly its own sub-account invites. The base table still has no
-- anon policy and no owner INSERT policy — creation only goes through the
-- SECURITY DEFINER RPC in section G, matching the "RPCs are the only
-- surface" design already documented at the top of 20260807190000_invites.sql.
------------------------------------------------------------------
alter table public.invites add column if not exists parent_account_id uuid references public.profiles(id);
create index if not exists invites_parent_account_idx on public.invites (parent_account_id);

create policy "invites owner select own sub account invites" on public.invites
  for select to authenticated
  using ( parent_account_id = (select auth.uid()) );

-- Column-grant tightening (Leg 1 style): the base table previously granted
-- full-row UPDATE to `authenticated` and relied solely on
-- `is_admin_or_staff()` in RLS to gate it. The only column an owner (or
-- admin, from the existing client) ever updates directly is `status`
-- (revoke), so narrow the grant instead of trusting RLS alone to stop an
-- owner rewriting another column (e.g. tier) on their own sub-account invite.
revoke update on public.invites from authenticated;
grant  update (status) on public.invites to authenticated;

create policy "invites owner revoke own sub account invites" on public.invites
  for update to authenticated
  using ( parent_account_id = (select auth.uid()) )
  with check ( parent_account_id = (select auth.uid()) );

------------------------------------------------------------------
-- G. create_sub_account_invite(p_email) — the owner-facing counterpart to
-- create_invite. Gated by is_account_owner() instead of is_admin_or_staff();
-- the tier is NEVER taken from the caller, it is always the owner's own tier,
-- so a sub-account always inherits its account's tier. invited_by AND
-- parent_account_id are both the owner's id.
------------------------------------------------------------------
create or replace function public.create_sub_account_invite(p_email text)
returns public.invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email  text := lower(trim(p_email));
  v_tier   public.customer_tier;
  v_invite public.invites;
begin
  if not public.is_account_owner() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if v_email is null or v_email = '' or position('@' in v_email) = 0 then
    raise exception 'invalid_email' using errcode = '22023';
  end if;

  select tier into v_tier from public.profiles where id = auth.uid();

  if exists (select 1 from auth.users u where lower(u.email) = v_email) then
    raise exception 'email_taken' using errcode = '23505';
  end if;

  insert into public.invites (email, tier, invited_by, parent_account_id)
  values (v_email, v_tier, auth.uid(), auth.uid())
  returning * into v_invite;

  return v_invite;
end;
$$;

revoke execute on function public.create_sub_account_invite(text) from public, anon, authenticated;
grant  execute on function public.create_sub_account_invite(text) to authenticated;

comment on function public.create_sub_account_invite(text) is
  'Owner-facing invite creation for wholesale/distributor sub-accounts. Gated by is_account_owner() (tier wholesale/distributor AND not itself a sub-account). Tier is always the caller''s own tier, never client-supplied. Reuses the redeem_invite flow (get_invite/redeem_invite from 20260807190000_invites.sql) unchanged — redeem_invite additionally copies invites.parent_account_id onto the new profile (see section H below).';

------------------------------------------------------------------
-- H. redeem_invite — replaced verbatim from 20260807190000_invites.sql with
-- one addition: the final profile update also copies parent_account_id from
-- the invite (null for a normal invite; the owner's id for a sub-account
-- invite created by section G above). Everything else — token locking,
-- expiry/status checks, password/display-name validation, the bcrypt
-- auth.users/auth.identities insert — is unchanged.
------------------------------------------------------------------
create or replace function public.redeem_invite(
  p_token        text,
  p_display_name text,
  p_password     text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.invites;
  v_name   text := trim(coalesce(p_display_name, ''));
  v_uid    uuid := gen_random_uuid();
begin
  -- Lock the invite row so concurrent redeems serialize on it.
  select * into v_invite
  from public.invites
  where token = p_token
  for update;

  if not found then
    raise exception 'invalid_token' using errcode = '22023';
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'invite_not_pending' using errcode = '22023';
  end if;

  if now() > v_invite.expires_at then
    raise exception 'invite_expired' using errcode = '22023';
  end if;

  if v_name = '' then
    raise exception 'display_name_required' using errcode = '22023';
  end if;

  if p_password is null or length(p_password) < 8 then
    raise exception 'weak_password' using errcode = '22023';
  end if;

  -- Reject if an auth user already owns this e-mail (case-insensitive, matching
  -- GoTrue's own normalization).
  if exists (select 1 from auth.users u where lower(u.email) = v_invite.email) then
    raise exception 'email_taken' using errcode = '23505';
  end if;

  -- Create the auth user. GoTrue-compatible column set; empty-string tokens to
  -- keep GoTrue's scanner happy; email_confirmed_at set (invite = trusted
  -- e-mail, no confirmation mail in v1). confirmed_at is generated — omitted.
  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data,
    confirmation_token,
    recovery_token,
    email_change,
    email_change_token_new,
    email_change_token_current,
    phone_change,
    phone_change_token,
    reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_uid,
    'authenticated',
    'authenticated',
    v_invite.email,
    extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    '', '', '', '', '', '', '', ''
  );

  -- Matching identity row (email provider). provider_id = the e-mail;
  -- identity_data carries sub + email (what GoTrue expects).
  insert into auth.identities (
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) values (
    v_invite.email,
    v_uid,
    jsonb_build_object('sub', v_uid::text, 'email', v_invite.email),
    'email',
    now(),
    now(),
    now()
  );

  -- trg_handle_new_user already inserted the profile as role='customer'.
  -- Apply the invite's tier + the chosen display name + sub-account parent
  -- (null for a normal invite, the owner's id for a create_sub_account_invite
  -- invite). trg_enforce_sub_account_parent re-validates the latter.
  update public.profiles
  set tier = v_invite.tier,
      display_name = v_name,
      parent_account_id = v_invite.parent_account_id
  where id = v_uid;

  -- Consume the invite.
  update public.invites
  set status = 'accepted',
      accepted_at = now()
  where id = v_invite.id;

  return jsonb_build_object('ok', true, 'email', v_invite.email);
end;
$$;

revoke execute on function public.redeem_invite(text, text, text) from public;
grant  execute on function public.redeem_invite(text, text, text) to anon, authenticated;

comment on function public.redeem_invite(text, text, text) is
  'Invite-only account creation (replaces disabled GoTrue signup). Validates a pending, non-expired token; enforces display name + 8-char password server-side; bcrypt-hashes the password via extensions.crypt (never stores/logs plaintext); creates auth.users + auth.identities; lets trg_handle_new_user seed the profile then sets tier+display_name+parent_account_id from the invite; marks the invite accepted. SECURITY DEFINER, anon-callable. Concurrency-safe via FOR UPDATE on the invite row.';

------------------------------------------------------------------
-- I. addresses become account-shared instead of user-private: a company
-- (owner + all its sub-accounts) sees and manages one shared address book.
-- `user_id` is kept as-is (who created/owns the row for audit purposes);
-- `account_id` is the new visibility scope. Existing rows backfill to their
-- own user_id (an account of one, same as today, until sub-accounts exist).
------------------------------------------------------------------
alter table public.addresses add column if not exists account_id uuid references public.profiles(id);

update public.addresses set account_id = user_id where account_id is null;

alter table public.addresses alter column account_id set not null;
alter table public.addresses alter column account_id set default public.current_account_id();

create index if not exists addresses_account_idx on public.addresses (account_id);

drop policy if exists addresses_select on public.addresses;
create policy addresses_select on public.addresses for select to authenticated
  using ( account_id = (select public.current_account_id()) );

drop policy if exists addresses_insert on public.addresses;
create policy addresses_insert on public.addresses for insert to authenticated
  with check ( account_id = (select public.current_account_id()) );

drop policy if exists addresses_update on public.addresses;
create policy addresses_update on public.addresses for update to authenticated
  using ( account_id = (select public.current_account_id()) )
  with check ( account_id = (select public.current_account_id()) );

drop policy if exists addresses_delete on public.addresses;
create policy addresses_delete on public.addresses for delete to authenticated
  using ( account_id = (select public.current_account_id()) );

-- The single-default invariant and delete-promotion triggers now scope by
-- account_id (one shared default per account) instead of user_id (one per
-- login) — replaced verbatim from 20260808100000_address_book.sql aside from
-- that column swap.
create or replace function public.addresses_enforce_default()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and not exists (select 1 from public.addresses where account_id = new.account_id) then
    new.is_default := true;
  end if;
  if new.is_default then
    update public.addresses set is_default = false, updated_at = now()
      where account_id = new.account_id and id <> new.id and is_default;
  end if;
  new.updated_at := now();
  return new;
end $$;

create or replace function public.addresses_promote_after_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.is_default then
    update public.addresses set is_default = true, updated_at = now()
      where id = (select id from public.addresses where account_id = old.account_id order by created_at desc limit 1);
  end if;
  return old;
end $$;
