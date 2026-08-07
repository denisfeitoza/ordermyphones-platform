-- supabase/tests/rls_suite.sql
-- Cross-account RLS regression suite for phase 01. Re-runnable, read-only,
-- always rolled back. Run as ONE batched call (Supabase Management API
-- `database/query` / MCP `execute_sql`) — each call is its own session,
-- `set local` does not survive across calls.
--
-- Later plans (01-07, 01-09) APPEND sections to this same file; 01-11 runs
-- the whole thing as the phase gate. Checked-in fixture, not an ad-hoc call.
--
-- Harness shape used: `set local role authenticated; set local
-- "request.jwt.claims" = '<json>';` — verified directly against this project
-- (Management API `database/query`, one batched `begin...rollback`) to
-- correctly switch `current_user` and resolve `auth.uid()` from the forged
-- claim. The `set_config('role', ...)` variant sketched as the primary shape
-- in 01-RESEARCH.md/01-01-PLAN.md was NOT what ended up needed here — the
-- plain `set local role authenticated` form worked on the first try over
-- this transport, so no fallback substitution was required. Recorded per
-- the plan's <output> requirement in 01-01-SUMMARY.md.

------------------------------------------------------------------
-- SECTION 0 — HARNESS SELF-TEST (negative control). Never delete.
-- Postgres table owners and superusers bypass RLS. If this batch is not
-- actually running as `authenticated`, every assertion below passes with
-- zero working policies and there is no other signal. Section 0 is the only
-- thing that makes a green run mean anything.
------------------------------------------------------------------
begin;
do $$
declare n int;
begin
  set local role authenticated;
  set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}';

  if current_user <> 'authenticated' then
    raise exception 'HARNESS BROKEN: current_user is %, expected authenticated', current_user;
  end if;

  select count(*) into n from public.rls_harness_canary;
  if n <> 0 then
    raise exception 'HARNESS BROKEN: canary returned % rows — RLS is not being enforced for this session', n;
  end if;
end $$;
rollback;

------------------------------------------------------------------
-- SECTION 1 — profiles: cross-account isolation + self-promotion guard
-- Runs against seeded test users when they exist (plan 01-06). Until then it
-- self-skips with a NOTICE so the suite is green-or-loud, never silently
-- vacuous.
------------------------------------------------------------------
begin;
do $$
declare a uuid; b uuid; n int; escalated boolean := false;
begin
  select id into a from public.profiles where email like 'consumer@%' limit 1;
  select id into b from public.profiles where email like 'retailer@%' limit 1;
  if a is null or b is null then
    raise notice 'SKIP section 1 — seeded test users not present yet (plan 01-06)';
    return;
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role','authenticated')::text, true);

  -- POSITIVE: customer A reads its own row
  select count(*) into n from public.profiles where id = a;
  if n <> 1 then raise exception 'FAIL: customer cannot read own profile (got % rows)', n; end if;

  -- NEGATIVE: customer A cannot read customer B
  select count(*) into n from public.profiles where id = b;
  if n <> 0 then raise exception 'FAIL: customer A read customer B profile (% rows)', n; end if;

  -- NEGATIVE: self-promotion to admin must be rejected (column grant or guard trigger)
  begin
    update public.profiles set role = 'admin' where id = a;
    escalated := true;
  exception when others then
    null;  -- expected: insufficient privilege (42501) from the column grant or the trigger
  end;
  if escalated then raise exception 'FAIL: customer promoted itself to admin'; end if;
end $$;
rollback;

------------------------------------------------------------------
-- SECTION 1a — self-provisioning self-promotion guard (no seeded users
-- required; exercises the REAL trg_handle_new_user + guard trigger, not
-- inspection). Section 1 above self-skips until 01-06 seeds real accounts;
-- this section stays green from day one and is what 01-11's phase gate can
-- actually rely on for "self-promotion is provably blocked by an automated
-- assertion." Inserts a throwaway auth.users row inside this same rolled
-- back transaction — nothing persists.
------------------------------------------------------------------
begin;
do $$
declare
  a uuid := gen_random_uuid();
  escalated boolean := false;
  r public.user_role;
begin
  insert into auth.users (id, email) values (a, 'guardprobe@example.invalid');

  -- Leg 3: signup trigger must hardcode role='customer', never trust
  -- client-supplied metadata.
  select role into r from public.profiles where id = a;
  if r is distinct from 'customer' then
    raise exception 'FAIL: handle_new_user did not default role to customer (got %)', r;
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role','authenticated')::text, true);

  -- Legs 1+2: column grant + guard trigger must reject a self-promotion
  -- attempt on the freshly-created row.
  begin
    update public.profiles set role = 'admin' where id = a;
    escalated := true;
  exception when others then
    null;  -- expected: insufficient privilege (42501) from the column grant or the trigger
  end;
  if escalated then raise exception 'FAIL: customer promoted itself to admin'; end if;
end $$;
rollback;

------------------------------------------------------------------
-- SECTION 2 — anonymous-role smoke test (no seeded users required)
-- Confirms the canary and profiles both refuse `anon`, proving `to
-- authenticated` on every policy actually short-circuits anonymous access
-- rather than merely relying on missing rows.
------------------------------------------------------------------
begin;
do $$
declare n int;
begin
  set local role anon;

  select count(*) into n from public.rls_harness_canary;
  if n <> 0 then raise exception 'FAIL: anon read % rows from rls_harness_canary', n; end if;

  select count(*) into n from public.profiles;
  if n <> 0 then raise exception 'FAIL: anon read % rows from profiles', n; end if;
end $$;
rollback;

------------------------------------------------------------------
-- SECTION 2 — catalog + inventory base tables are staff-only
-- Runs against a seeded customer test user (plan 01-06). Until then it
-- self-skips with a NOTICE. Every base table this plan (01-05) created must
-- return ZERO rows to a customer session — inventory.unit_cost_cents and
-- product_variants.grade (raw vendor label) are both admin-only surfaces
-- (T-01-23, T-01-24).
------------------------------------------------------------------
begin;
do $$
declare a uuid; n int;
begin
  select id into a from public.profiles where email like 'consumer@%' limit 1;
  if a is null then raise notice 'SKIP section 2 — seeded test users not present yet (plan 01-06)'; return; end if;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role','authenticated')::text, true);

  if current_user <> 'authenticated' then
    raise exception 'HARNESS BROKEN: current_user is %', current_user;
  end if;

  select count(*) into n from public.products;         if n <> 0 then raise exception 'FAIL: customer read products (%)', n; end if;
  select count(*) into n from public.product_variants; if n <> 0 then raise exception 'FAIL: customer read product_variants (%)', n; end if;
  select count(*) into n from public.inventory;        if n <> 0 then raise exception 'FAIL: customer read inventory (%) — unit_cost_cents exposure', n; end if;
  select count(*) into n from public.stock_movements;  if n <> 0 then raise exception 'FAIL: customer read stock_movements (%)', n; end if;
  select count(*) into n from public.stock_locations;  if n <> 0 then raise exception 'FAIL: customer read stock_locations (%)', n; end if;
end $$;
rollback;

------------------------------------------------------------------
-- SECTION 2b — positive control: an ADMIN session must be able to read all
-- five tables without a permission error. Without this, a migration that
-- accidentally shipped zero policies (customers AND staff both blocked)
-- would pass Section 2 perfectly — Section 2 alone only proves "nothing
-- readable by anyone," not "staff can actually read it."
------------------------------------------------------------------
begin;
do $$
declare a uuid; n int;
begin
  select id into a from public.profiles where email like 'admin@%' limit 1;
  if a is null then raise notice 'SKIP section 2b — seeded test users not present yet (plan 01-06)'; return; end if;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role','authenticated')::text, true);

  if current_user <> 'authenticated' then
    raise exception 'HARNESS BROKEN: current_user is %', current_user;
  end if;

  select count(*) into n from public.products;         if n < 0 then raise exception 'unreachable'; end if;
  select count(*) into n from public.product_variants; if n < 0 then raise exception 'unreachable'; end if;
  select count(*) into n from public.inventory;        if n < 0 then raise exception 'unreachable'; end if;
  select count(*) into n from public.stock_movements;  if n < 0 then raise exception 'unreachable'; end if;
  select count(*) into n from public.stock_locations;  if n < 0 then raise exception 'unreachable'; end if;
exception
  when insufficient_privilege then
    raise exception 'FAIL: admin session was denied read access by an RLS policy — staff policy is missing or misconfigured';
end $$;
rollback;

-- Every assertion raises on failure, so "no exception" is the pass
-- condition — there is no output to eyeball and no way to misread a green
-- run.
