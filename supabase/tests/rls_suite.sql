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

-- Every assertion raises on failure, so "no exception" is the pass
-- condition — there is no output to eyeball and no way to misread a green
-- run.
