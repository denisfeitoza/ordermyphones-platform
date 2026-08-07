-- 20260806120000_foundation_profiles.sql
-- Phase 1 Plan 01-01: role enums, profiles table, SECURITY DEFINER role
-- helpers, three-leg privilege-escalation defense, signup trigger, RLS,
-- and the harness self-test canary.
--
-- Policy call convention for every migration in this phase:
--   using ( (select public.is_admin_or_staff()) )  -- always (select ...)-wrapped
--   InitPlan-hoisted per statement, not per row. Always `to authenticated` so
--   `anon` short-circuits. See 01-RESEARCH.md Pattern 1.

------------------------------------------------------------------
-- A. Enums (D12, D15)
------------------------------------------------------------------
create type public.user_role     as enum ('admin', 'staff', 'customer');
create type public.customer_tier as enum ('consumer', 'retailer', 'wholesale', 'distributor');

------------------------------------------------------------------
-- B. public.profiles
------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  role         public.user_role not null default 'customer',
  tier         public.customer_tier,              -- null until assigned; customers only
  is_test      boolean not null default false,
  display_name text,
  phone        text,
  locale       text not null default 'en',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index profiles_role_idx on public.profiles (role);
create index profiles_is_test_idx on public.profiles (is_test) where is_test = true;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Trigger-only function: no one should invoke it directly via PostgREST RPC.
revoke execute on function public.set_updated_at() from public, anon, authenticated;

------------------------------------------------------------------
-- C. Role helper functions
-- language sql stable security definer, search_path = '' (empty, not
-- `public`) — `search_path = public` trips the Supabase linter
-- (function_search_path_mutable) and is a shadowing vector. Correction to
-- the discarded 0002_rls_policies.sql, which used `set search_path = public`.
------------------------------------------------------------------
create or replace function public.current_app_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  )
$$;

create or replace function public.is_admin_or_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'staff')
  )
$$;

create or replace function public.current_customer_tier()
returns public.customer_tier
language sql
stable
security definer
set search_path = ''
as $$
  select tier from public.profiles where id = auth.uid()
$$;

-- Supabase's public schema grants EXECUTE to anon/authenticated by default
-- (ALTER DEFAULT PRIVILEGES at the project level) independently of the
-- PUBLIC pseudo-role, so `anon` and `authenticated` must each be revoked
-- explicitly — revoking from PUBLIC alone does not touch those grants.
revoke execute on function public.current_app_role()      from public, anon, authenticated;
revoke execute on function public.is_admin()               from public, anon, authenticated;
revoke execute on function public.is_admin_or_staff()       from public, anon, authenticated;
revoke execute on function public.current_customer_tier()  from public, anon, authenticated;

grant execute on function public.current_app_role()      to authenticated;
grant execute on function public.is_admin()               to authenticated;
grant execute on function public.is_admin_or_staff()       to authenticated;
grant execute on function public.current_customer_tier()  to authenticated;

------------------------------------------------------------------
-- D. RLS on profiles (enabled in this same migration — D15, no exceptions)
------------------------------------------------------------------
alter table public.profiles enable row level security;

create policy "profiles select self or staff" on public.profiles
  for select to authenticated
  using ( (select auth.uid()) = id or (select public.is_admin_or_staff()) );

create policy "profiles update self" on public.profiles
  for update to authenticated
  using ( (select auth.uid()) = id )
  with check ( (select auth.uid()) = id );

create policy "profiles update staff" on public.profiles
  for update to authenticated
  using ( (select public.is_admin_or_staff()) )
  with check ( (select public.is_admin_or_staff()) );

-- No INSERT and no DELETE policy for `authenticated` — rows are created only
-- by trg_handle_new_user (Leg 3, below) and removed only via auth.users cascade.

------------------------------------------------------------------
-- E. Leg 1 — column privileges (checked BEFORE RLS; RLS has no column
-- granularity, so this is what actually stops a customer writing `role`).
------------------------------------------------------------------
revoke update on public.profiles from authenticated;
grant  update (display_name, phone, locale) on public.profiles to authenticated;

------------------------------------------------------------------
-- F. Leg 2 — privileged-column guard trigger (belt-and-suspenders: catches
-- any future column-grant drift that would reopen Leg 1's gap).
------------------------------------------------------------------
create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Block ONLY the PostgREST-facing role. service_role and the table owner
  -- (postgres, used by the Management API / MCP apply_migration / execute_sql
  -- path) must pass, or the seed script and every future admin migration
  -- would fail with a message that reads like a policy bug.
  if current_user = 'authenticated'
     and ( new.role    is distinct from old.role
        or new.is_test is distinct from old.is_test
        or new.tier    is distinct from old.tier ) then
    raise exception 'profiles.role, profiles.is_test and profiles.tier are admin-managed columns'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger trg_guard_profile_privileged_columns
  before update on public.profiles
  for each row execute function public.guard_profile_privileged_columns();

-- Trigger-only function: Postgres refuses to run a trigger-typed function
-- outside trigger context, but PostgREST still lists it as an RPC endpoint
-- unless EXECUTE is revoked — close that surface explicitly.
revoke execute on function public.guard_profile_privileged_columns() from public, anon, authenticated;

-- Admin-driven role/tier changes land in Phase 7 as a SECURITY DEFINER RPC
-- with fresh re-auth; until then only service_role / the table owner can
-- move these columns.

------------------------------------------------------------------
-- G. Leg 3 — signup trigger that never trusts client metadata
------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Hardcode 'customer' — never read the client-supplied signup metadata
  -- payload for a role field; that value is attacker-controlled at signup
  -- time and is the third privilege-escalation path.
  insert into public.profiles (id, email, role, is_test)
  values (new.id, new.email, 'customer', false)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger trg_handle_new_user
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Trigger-only function: close the PostgREST RPC surface (same rationale as
-- guard_profile_privileged_columns above).
revoke execute on function public.handle_new_user() from public, anon, authenticated;

------------------------------------------------------------------
-- H. Harness canary — negative control for supabase/tests/rls_suite.sql.
-- RLS enabled, ZERO policies granted to authenticated, one row. Must always
-- return 0 rows to the authenticated role. Do not add a policy here.
------------------------------------------------------------------
create table public.rls_harness_canary (
  id   int primary key,
  note text not null
);

alter table public.rls_harness_canary enable row level security;

insert into public.rls_harness_canary (id, note)
  values (1, 'If an authenticated session can read this row, the RLS test harness is not enforcing RLS.');

comment on table public.rls_harness_canary is
  'Negative control for supabase/tests/rls_suite.sql. RLS enabled, no policies, one row. Must always return 0 rows to the authenticated role. Do not add a policy.';
