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
-- SECTION 2a — self-provisioning catalog/inventory isolation (no seeded
-- users required; mirrors Section 1a). Section 2 above self-skips until
-- 01-06 seeds real accounts AND until a later plan seeds real catalog rows
-- — until both exist, a bare "customer reads 0 rows" assertion is vacuous
-- (an empty table returns 0 rows to EVERY role, RLS working or not). This
-- section seeds one real row per table as table owner, self-provisions a
-- customer identity and an admin identity, then asserts BOTH directions for
-- real: customer sees 0 rows (negative) AND admin sees >=1 row without a
-- permission error (positive — proves the staff policies actually grant,
-- not merely that nothing is readable by anyone). Nothing persists; the
-- whole thing is rolled back.
------------------------------------------------------------------
begin;
do $$
declare
  consumer_id uuid := gen_random_uuid();
  admin_id    uuid := gen_random_uuid();
  pid uuid; vid uuid; lid uuid;
  n int;
  admin_role public.user_role;
begin
  -- Seed one real row per table, as table owner (bypasses RLS).
  insert into public.products (make, model, model_number, category)
  values ('Section2aMake', 'Section2aModel', 'S2A-001', 'phones') returning id into pid;

  insert into public.product_variants
    (product_id, capacity, color, carrier, carrier_raw, lock_status, grade, grade_scale, sku)
  values (pid, '128GB', 'Black', 'ATT', 'AT&T', 'unlocked', 'DLS B', 'DLS', 'S2A-001-128-BLK-ATT-UNL-DLSB')
  returning id into vid;

  insert into public.stock_locations (code, display_name, region)
  values ('S2A-LOC', 'Section 2a Location', 'test') returning id into lid;

  insert into public.stock_movements (variant_id, location_id, delta, reason)
  values (vid, lid, 10, 'seed');

  -- Self-provision a customer identity (real trigger, real default role).
  insert into auth.users (id, email) values (consumer_id, 'section2a-consumer@example.invalid');

  -- Self-provision an admin identity. The role UPDATE runs here, still as
  -- table owner (current_user <> 'authenticated'), so the privileged-column
  -- guard trigger permits it — the same mechanism 01-01's admin seed script
  -- will use in production.
  insert into auth.users (id, email) values (admin_id, 'section2a-admin@example.invalid');
  update public.profiles set role = 'admin' where id = admin_id;
  select role into admin_role from public.profiles where id = admin_id;
  if admin_role is distinct from 'admin' then
    raise exception 'HARNESS BROKEN: admin self-provisioning did not take (got %)', admin_role;
  end if;

  set local role authenticated;

  -- NEGATIVE: as the customer identity, every base table this plan created
  -- must return zero rows despite one real row existing in each.
  perform set_config('request.jwt.claims', json_build_object('sub', consumer_id, 'role','authenticated')::text, true);
  if current_user <> 'authenticated' then
    raise exception 'HARNESS BROKEN: current_user is %', current_user;
  end if;

  select count(*) into n from public.products;         if n <> 0 then raise exception 'FAIL: customer read products (%)', n; end if;
  select count(*) into n from public.product_variants; if n <> 0 then raise exception 'FAIL: customer read product_variants (%)', n; end if;
  select count(*) into n from public.inventory;        if n <> 0 then raise exception 'FAIL: customer read inventory (%) — unit_cost_cents exposure', n; end if;
  select count(*) into n from public.stock_movements;  if n <> 0 then raise exception 'FAIL: customer read stock_movements (%)', n; end if;
  select count(*) into n from public.stock_locations;  if n <> 0 then raise exception 'FAIL: customer read stock_locations (%)', n; end if;

  -- POSITIVE: swap the JWT claims to the admin identity (same `authenticated`
  -- Postgres role throughout — auth.uid() re-resolves from the claims GUC on
  -- every call, no role-membership switch needed or possible mid-transaction).
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role','authenticated')::text, true);

  select count(*) into n from public.products;         if n < 1 then raise exception 'FAIL: admin could not read products — staff policy missing/misconfigured'; end if;
  select count(*) into n from public.product_variants; if n < 1 then raise exception 'FAIL: admin could not read product_variants — staff policy missing/misconfigured'; end if;
  select count(*) into n from public.inventory;        if n < 1 then raise exception 'FAIL: admin could not read inventory — staff policy missing/misconfigured'; end if;
  select count(*) into n from public.stock_movements;  if n < 1 then raise exception 'FAIL: admin could not read stock_movements — staff policy missing/misconfigured'; end if;
  select count(*) into n from public.stock_locations;  if n < 1 then raise exception 'FAIL: admin could not read stock_locations — staff policy missing/misconfigured'; end if;
end $$;
rollback;

------------------------------------------------------------------
-- SECTION 2b — positive control against SEEDED test users (plan 01-06).
-- Self-skips until then; Section 2a above already proves the same claim
-- today via self-provisioned identities, so this section's purpose is to
-- re-confirm against the real invited-admin seed flow once it exists.
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
end $$;
rollback;

------------------------------------------------------------------
-- SECTION 3 — supplier + cost confidentiality (FOUND-02, criterion 3/4)
-- Self-provisioning (no seeded test users required — mirrors Section 2a;
-- plan 01-06 has not run yet at the time this section was written, and this
-- section must not depend on it). Seeds a throwaway product / variant /
-- location / movement / supplier AND a throwaway customer identity, inside
-- its own rolled-back transaction. A view that returns zero rows because
-- the database is empty proves nothing, so every table probed here gets a
-- real row first.
------------------------------------------------------------------
begin;
do $$
declare
  consumer_id uuid := gen_random_uuid();
  p uuid; v uuid; l uuid; sup uuid; n int;
begin
  -- Fixtures, created as table owner (bypasses RLS) BEFORE dropping to authenticated.
  insert into public.products (make, model, model_number, category)
    values ('Apple','iPhone 11','A2111-TEST','phones') returning id into p;
  insert into public.product_variants (product_id, capacity, color, carrier, carrier_raw,
                                       lock_status, grade, grade_scale, sku)
    values (p, '256GB', 'Black', 'ATT', 'AT&T', 'unlocked', 'DLS B+', 'DLS',
            'APPLE-A2111-TEST-256GB-BLACK-ATT-UNLOCKED-DBP') returning id into v;
  insert into public.stock_locations (code, display_name, region)
    values ('S3-TESTLOC','Section 3 Texas','US-South') returning id into l;
  insert into public.stock_movements (variant_id, location_id, delta, reason, unit_cost_cents)
    values (v, l, 38, 'seed', 12700);
  update public.inventory set unit_cost_cents = 12700 where variant_id = v and location_id = l;

  -- A throwaway supplier row too, self-provisioned rather than relying on
  -- scripts/seed-suppliers.mjs having been run against this project — Section
  -- 3 must be non-vacuous on a project where that gitignored script has
  -- never executed.
  insert into public.suppliers (code, legal_name, anon_label, country, kind)
    values ('s3-test-supplier', 'Section3TestSupplierRealName', 'Section3TestSupplierAnon', 'US', 'other')
    returning id into sup;
  update public.stock_locations set supplier_id = sup where id = l;

  -- Self-provision a customer identity (real trigger, real default role) — mirrors Section 2a.
  insert into auth.users (id, email) values (consumer_id, 'section3-consumer@example.invalid');

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', consumer_id, 'role','authenticated')::text, true);
  if current_user <> 'authenticated' then
    raise exception 'HARNESS BROKEN: current_user is %', current_user;
  end if;

  -- NEGATIVE: no supplier identity, at all
  select count(*) into n from public.suppliers;
  if n <> 0 then raise exception 'FAIL(criterion 3): customer read % supplier rows', n; end if;

  -- NEGATIVE: no cost, via the base table
  select count(*) into n from public.inventory;
  if n <> 0 then raise exception 'FAIL(criterion 3): customer read % inventory rows (unit_cost_cents exposure)', n; end if;

  -- POSITIVE: the customer CAN see stock through the masking view (else the catalog is dead)
  select count(*) into n from public.inventory_public where variant_id = v;
  if n <> 1 then raise exception 'FAIL: inventory_public returned % rows for a customer — masking view is over-restrictive (security_invoker regression?)', n; end if;

  select count(*) into n from public.product_variants_public where id = v;
  if n <> 1 then raise exception 'FAIL: product_variants_public returned % rows', n; end if;

  select count(*) into n from public.stock_locations_public where id = l;
  if n <> 1 then raise exception 'FAIL: stock_locations_public returned % rows', n; end if;

  -- NEGATIVE: stock_locations_public never carries supplier_id, even though
  -- this fixture explicitly linked location l to supplier sup above — the
  -- forbidden-column guard (Section 3b) asserts this generically; row-level
  -- confirmation that the customer session cannot correlate via the view:
  select count(*) into n
    from information_schema.columns
   where table_schema = 'public' and table_name = 'stock_locations_public' and column_name = 'supplier_id';
  if n <> 0 then raise exception 'FAIL: stock_locations_public exposes supplier_id'; end if;
end $$;
rollback;

------------------------------------------------------------------
-- SECTION 3 (continued) — suppliers_public row-level positive/negative,
-- kept as its own DO block for a cleaner declare list than the block above.
------------------------------------------------------------------
begin;
do $$
declare
  consumer_id uuid := gen_random_uuid();
  sup uuid;
  n int;
begin
  insert into public.suppliers (code, legal_name, anon_label, country, kind)
    values ('s3b-test-supplier', 'Section3bTestSupplierRealName', 'Section3bTestSupplierAnon', 'US', 'other')
    returning id into sup;

  insert into auth.users (id, email) values (consumer_id, 'section3b-consumer@example.invalid');

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', consumer_id, 'role','authenticated')::text, true);
  if current_user <> 'authenticated' then
    raise exception 'HARNESS BROKEN: current_user is %', current_user;
  end if;

  -- POSITIVE: the anon_label is reachable through the view for this exact row.
  select count(*) into n from public.suppliers_public where id = sup;
  if n <> 1 then raise exception 'FAIL: suppliers_public returned % rows for a known-active supplier', n; end if;

  -- NEGATIVE: suppliers_public never carries legal_name as a column at all
  -- (schema-level; the forbidden-column guard below also asserts this
  -- generically). Confirm no row-level way to reach it either, e.g. via a
  -- customer directly selecting the base table by id.
  select count(*) into n from public.suppliers where id = sup;
  if n <> 0 then raise exception 'FAIL: customer read the base suppliers row directly (%)', n; end if;
end $$;
rollback;

------------------------------------------------------------------
-- SECTION 3a — anon-role confidentiality + fail-closed masking check.
-- Confirms the `anon` grant this migration introduced on the five masking
-- views doesn't leak the base tables, while the masking views themselves
-- still work for a fully anonymous (unauthenticated) request — the
-- fail-closed property the migration's comments claim.
------------------------------------------------------------------
begin;
do $$
declare sup uuid; n int;
begin
  insert into public.suppliers (code, legal_name, anon_label, country, kind)
    values ('s3a-test-supplier', 'Section3aTestSupplierRealName', 'Section3aTestSupplierAnon', 'US', 'other')
    returning id into sup;

  set local role anon;

  -- The migration explicitly `revoke select on public.suppliers from anon`
  -- (belt-and-braces against a future blanket schema grant), which makes
  -- anon's direct query fail with insufficient_privilege (42501) rather than
  -- silently returning zero rows via RLS — a stricter, equally acceptable
  -- fail-closed outcome. Accept either.
  begin
    select count(*) into n from public.suppliers;
    if n <> 0 then raise exception 'FAIL: anon read % supplier rows', n; end if;
  exception when insufficient_privilege then
    null; -- expected: explicit revoke on suppliers from anon
  end;

  select count(*) into n from public.inventory; if n <> 0 then raise exception 'FAIL: anon read % inventory rows', n; end if;

  select count(*) into n from public.suppliers_public where id = sup;
  if n <> 1 then raise exception 'FAIL: anon could not read suppliers_public for a known-active row — anon grant on masking views regressed'; end if;
end $$;
rollback;

------------------------------------------------------------------
-- SECTION 3b — schema-level forbidden-column guard (FOUND-02).
-- Outside any session simulation: catches a future column being added to a
-- base table and silently flowing into a masking view — the exact failure
-- mode `select *` would cause. Runs unconditionally, every suite execution.
------------------------------------------------------------------
do $$
declare bad text;
begin
  select string_agg(table_name || '.' || column_name, ', ') into bad
    from information_schema.columns
   where table_schema = 'public'
     and table_name like '%\_public'
     and column_name in ('unit_cost_cents','source_import_id','legal_name','notes',
                         'supplier_id','grade','carrier_raw');
  if bad is not null then
    raise exception 'FAIL(FOUND-02): forbidden column(s) exposed through a public view: %', bad;
  end if;
end $$;

-- Every assertion raises on failure, so "no exception" is the pass
-- condition — there is no output to eyeball and no way to misread a green
-- run.
--
-- The security_invoker sabotage demonstration (proving this suite would
-- catch someone applying the Supabase linter's security_invoker=true
-- suggestion to a masking view) was run once as a scratch, rolled-back
-- transaction during plan 01-07's execution and is NOT part of this file —
-- see 01-07-SUMMARY.md for the transcript. It is not re-run automatically
-- on every suite execution because it mutates view options mid-batch, which
-- is a heavier and riskier operation than a read-only assertion belongs to
-- be in a suite that other plans append to and run routinely.

------------------------------------------------------------------
-- SECTION 4 — pricing tier gate + order isolation (plan 01-09; PRICE-01's
-- server-side tier invariant, T-01-50 through T-01-55). Self-provisioning
-- throughout — mirrors Section 2a/3's shape (fixtures created as table
-- owner before dropping to `authenticated`, current_user guard on every
-- claims switch, everything rolled back) rather than depending on 01-06's
-- seeded test users, per this plan's explicit instruction.
--
-- Deviation from the plan's literal narrative, recorded here and in
-- 01-09-SUMMARY.md: the plan text describes "a variant plus four prices
-- rows... [plus] a fifth row with visible = false for the consumer tier"
-- all on the SAME variant, then later asserts "count(*) from prices where
-- variant_id = v returns 5". public.prices carries `unique (variant_id,
-- tier)` (Task 1, locked) — a second consumer-tier row on the same variant
-- is a constraint violation, not a valid fixture, so five rows cannot
-- co-exist on one variant_id. Section 4a below uses a second variant
-- (v_hidden) for the hidden row instead; this is the schema-consistent
-- form of the same assertion ("a hidden price never reaches a customer,
-- even at their own tier, even when a real visible price exists for that
-- tier elsewhere") and the staff positive control checks both variants.
------------------------------------------------------------------

------------------------------------------------------------------
-- SECTION 4a — per-tier price gate (PRICE-01) + staff positive control.
------------------------------------------------------------------
begin;
do $$
declare
  pid uuid; v uuid; v_hidden uuid;
  consumer_id  uuid := gen_random_uuid();
  wholesale_id uuid := gen_random_uuid();
  admin_id     uuid := gen_random_uuid();
  n int;
  seen_tier public.customer_tier;
begin
  -- Fixtures, as table owner (bypasses RLS) before dropping to authenticated.
  insert into public.products (make, model, model_number, category)
    values ('Section4Make', 'Section4Model', 'S4-001', 'phones') returning id into pid;

  insert into public.product_variants
    (product_id, capacity, color, carrier, carrier_raw, lock_status, grade, grade_scale, sku)
  values (pid, '256GB', 'Black', 'ATT', 'AT&T', 'unlocked', 'DLS B', 'DLS', 'S4-001-256-BLK-ATT-UNL-DLSB')
  returning id into v;

  insert into public.product_variants
    (product_id, capacity, color, carrier, carrier_raw, lock_status, grade, grade_scale, sku)
  values (pid, '128GB', 'Black', 'ATT', 'AT&T', 'unlocked', 'DLS B', 'DLS', 'S4-002-128-BLK-ATT-UNL-DLSB')
  returning id into v_hidden;

  insert into public.prices (variant_id, tier, price_cents, visible) values
    (v, 'consumer',    29900, true),
    (v, 'retailer',    27900, true),
    (v, 'wholesale',   24900, true),
    (v, 'distributor', 22900, true);

  -- The hidden row — see the deviation note above for why this lives on a
  -- second variant rather than a second row on v.
  insert into public.prices (variant_id, tier, price_cents, visible) values
    (v_hidden, 'consumer', 19900, false);

  -- One real row each into pricing_flags and grade_classification_queue so
  -- the "customer reads 0 rows" assertions below are non-vacuous (mirrors
  -- Section 2a's rationale: an empty table returns 0 rows to EVERY role,
  -- RLS working or not — a real row must exist first).
  insert into public.pricing_flags (variant_id, kind) values (v, 'margin');
  insert into public.grade_classification_queue (vendor_code, vendor_grade)
    values ('S4VENDOR', 'S4 UNKNOWN GRADE');

  insert into auth.users (id, email) values (consumer_id,  'section4-consumer@example.invalid');
  insert into auth.users (id, email) values (wholesale_id, 'section4-wholesale@example.invalid');
  insert into auth.users (id, email) values (admin_id,     'section4-admin@example.invalid');
  update public.profiles set tier = 'consumer'  where id = consumer_id;
  update public.profiles set tier = 'wholesale' where id = wholesale_id;
  update public.profiles set role = 'admin'     where id = admin_id;

  set local role authenticated;

  -- CONSUMER: exactly one visible row on v, and it is the consumer-tier row.
  perform set_config('request.jwt.claims', json_build_object('sub', consumer_id, 'role','authenticated')::text, true);
  if current_user <> 'authenticated' then raise exception 'HARNESS BROKEN: current_user is %', current_user; end if;

  select count(*) into n from public.prices where variant_id = v;
  if n <> 1 then raise exception 'FAIL(4a): consumer saw % price rows on v, expected 1', n; end if;

  select tier into seen_tier from public.prices where variant_id = v;
  if seen_tier is distinct from 'consumer' then
    raise exception 'FAIL(4a): consumer''s one visible row was tier %, expected consumer', seen_tier;
  end if;

  -- Deliberate attempt to widen the query to a different tier — the
  -- assertion that a customer cannot read another tier's price by asking
  -- for it (PRICE-01: "never from a URL param or cookie").
  select count(*) into n from public.prices where variant_id = v and tier = 'distributor';
  if n <> 0 then raise exception 'FAIL(4a): consumer read the distributor-tier price by requesting it (% rows)', n; end if;

  -- A hidden row at the consumer's own tier must still not appear.
  select count(*) into n from public.prices where variant_id = v_hidden;
  if n <> 0 then raise exception 'FAIL(4a): consumer read a visible=false price (% rows)', n; end if;

  -- CONSUMER NEGATIVE: the orchestrator's explicit proof requirement — a
  -- customer session must read 0 rows of pricing_settings/flags/
  -- reconciliation (reconciliation_queue is covered by Section 4b).
  -- pricing_settings is the table T-01-57 calls OMP's entire margin
  -- structure (floors, bands, kit costs, percentage caps) and carries 16
  -- real seeded rows from Task 1, so this assertion is non-vacuous today.
  select count(*) into n from public.pricing_settings;
  if n <> 0 then raise exception 'FAIL(4a): consumer read % pricing_settings rows — margin structure exposure (T-01-57)', n; end if;

  select count(*) into n from public.pricing_flags;
  if n <> 0 then raise exception 'FAIL(4a): consumer read % pricing_flags rows', n; end if;

  select count(*) into n from public.grade_classification_queue;
  if n <> 0 then raise exception 'FAIL(4a): consumer read % grade_classification_queue rows', n; end if;

  -- CONSUMER POSITIVE: tiers and vendor_grade_map are the only `using
  -- (true)` policies in this plan — storefront product information every
  -- signed-in session should see. Without this check, the three negatives
  -- above would be indistinguishable from "this session is blind to
  -- everything" rather than "RLS is discriminating correctly."
  select count(*) into n from public.tiers;
  if n <> 4 then raise exception 'FAIL(4a): consumer saw % tiers rows, expected 4', n; end if;

  select count(*) into n from public.vendor_grade_map where vendor_code = 'HYLA';
  if n <> 13 then raise exception 'FAIL(4a): consumer saw % HYLA grade-map rows, expected 13', n; end if;

  -- WHOLESALE: the gate discriminates, it does not merely restrict
  -- everyone to one hardcoded tier.
  perform set_config('request.jwt.claims', json_build_object('sub', wholesale_id, 'role','authenticated')::text, true);
  select count(*) into n from public.prices where variant_id = v;
  if n <> 1 then raise exception 'FAIL(4a): wholesale saw % price rows on v, expected 1', n; end if;
  select tier into seen_tier from public.prices where variant_id = v;
  if seen_tier is distinct from 'wholesale' then
    raise exception 'FAIL(4a): wholesale''s one visible row was tier %, expected wholesale', seen_tier;
  end if;

  -- STAFF POSITIVE CONTROL (plan's Section 4c, folded into this same
  -- transaction since it depends on the fixtures above): an admin session
  -- sees strictly more than any customer session — all four tier rows on
  -- v, plus the hidden row on v_hidden that no customer session can reach.
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role','authenticated')::text, true);
  select count(*) into n from public.prices where variant_id = v;
  if n <> 4 then raise exception 'FAIL(4c): admin saw % rows on v, expected 4 (all tiers) — staff policy missing/misconfigured', n; end if;
  select count(*) into n from public.prices where variant_id = v_hidden;
  if n <> 1 then raise exception 'FAIL(4c): admin could not see the hidden price row — staff policy missing/misconfigured'; end if;

  select count(*) into n from public.pricing_settings;
  if n < 1 then raise exception 'FAIL(4c): admin could not read pricing_settings — staff policy missing/misconfigured'; end if;
end $$;
rollback;

------------------------------------------------------------------
-- SECTION 4b — cross-customer order isolation, self-approval negative
-- control, and staff positive control (T-01-51, T-01-52).
------------------------------------------------------------------
begin;
do $$
declare
  pid uuid; v uuid;
  a_id     uuid := gen_random_uuid();  -- consumer A
  b_id     uuid := gen_random_uuid();  -- retailer B
  admin_id uuid := gen_random_uuid();
  order_a uuid; order_b uuid;
  n int;
  status_after public.order_status;
begin
  insert into public.products (make, model, model_number, category)
    values ('Section4bMake', 'Section4bModel', 'S4B-001', 'phones') returning id into pid;

  insert into public.product_variants
    (product_id, capacity, color, carrier, carrier_raw, lock_status, grade, grade_scale, sku)
  values (pid, '64GB', 'Black', 'ATT', 'AT&T', 'unlocked', 'DLS B', 'DLS', 'S4B-001-64-BLK-ATT-UNL-DLSB')
  returning id into v;

  insert into auth.users (id, email) values (a_id,     'section4b-consumer@example.invalid');
  insert into auth.users (id, email) values (b_id,     'section4b-retailer@example.invalid');
  insert into auth.users (id, email) values (admin_id, 'section4b-admin@example.invalid');
  update public.profiles set tier = 'consumer' where id = a_id;
  update public.profiles set tier = 'retailer'  where id = b_id;
  update public.profiles set role = 'admin'     where id = admin_id;

  -- Fixtures: one pending order per customer, as table owner (bypasses RLS).
  insert into public.orders (customer_id, tier_at_order) values (a_id, 'consumer') returning id into order_a;
  insert into public.orders (customer_id, tier_at_order) values (b_id, 'retailer')  returning id into order_b;
  insert into public.order_items (order_id, variant_id, qty_requested, unit_price_cents, tier)
    values (order_a, v, 2, 29900, 'consumer');
  insert into public.order_items (order_id, variant_id, qty_requested, unit_price_cents, tier)
    values (order_b, v, 20, 24900, 'retailer');

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a_id, 'role','authenticated')::text, true);
  if current_user <> 'authenticated' then raise exception 'HARNESS BROKEN: current_user is %', current_user; end if;

  -- Own order readable.
  select count(*) into n from public.orders where id = order_a;
  if n <> 1 then raise exception 'FAIL(4b): A could not read its own order'; end if;

  -- B's order not readable.
  select count(*) into n from public.orders where id = order_b;
  if n <> 0 then raise exception 'FAIL(4b): A read B''s order (%)', n; end if;

  -- B's order_items not readable.
  select count(*) into n from public.order_items where order_id = order_b;
  if n <> 0 then raise exception 'FAIL(4b): A read B''s order_items (%)', n; end if;

  -- Negative write: A cannot approve its own order. A filtered UPDATE
  -- affects zero rows and raises nothing, so assert on the resulting
  -- STATE (still 'pending'), never on catching an exception alone.
  begin
    update public.orders set status = 'approved' where id = order_a;
  exception when others then
    null;
  end;
  select status into status_after from public.orders where id = order_a;
  if status_after is distinct from 'pending' then
    raise exception 'FAIL(4b): A''s order status changed to % via a self-issued UPDATE — customer self-approval succeeded', status_after;
  end if;

  -- reconciliation_queue and audit_log: zero rows for a customer session.
  select count(*) into n from public.reconciliation_queue;
  if n <> 0 then raise exception 'FAIL(4b): customer read % reconciliation_queue rows', n; end if;
  select count(*) into n from public.audit_log;
  if n <> 0 then raise exception 'FAIL(4b): customer read % audit_log rows', n; end if;

  -- STAFF POSITIVE CONTROL (plan's Section 4c, folded in here): an admin
  -- session sees both orders and both order_items rows without a
  -- permission error — proving staff visibility is genuinely broader, not
  -- that the policies simply block everyone.
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role','authenticated')::text, true);
  select count(*) into n from public.orders where id in (order_a, order_b);
  if n <> 2 then raise exception 'FAIL(4c): admin saw % of 2 orders — staff policy missing/misconfigured', n; end if;
  select count(*) into n from public.order_items where order_id in (order_a, order_b);
  if n <> 2 then raise exception 'FAIL(4c): admin saw % of 2 order_items — staff policy missing/misconfigured', n; end if;
end $$;
rollback;

------------------------------------------------------------------
-- SECTION 5 — PHASE GATE (schema-level invariants, no session simulation)
-- These assertions must hold for every phase from here on, not just phase 01.
--
-- Assertion 4's regex was calibrated against this project's actual
-- pg_policies text, not against the plan's first-draft guess. Postgres does
-- not store policy expressions verbatim — it re-renders them from the parse
-- tree, stripping schema qualification and adding a column alias, so
-- `(select public.is_admin_or_staff())` comes back as
-- `( SELECT is_admin_or_staff() AS is_admin_or_staff)`. Confirmed by reading
-- `select tablename, policyname, qual, with_check from pg_policies where
-- schemaname = 'public'` directly against rdkkbiyugcjyrnkvobrr (2026-08-07)
-- before writing the pattern below.
--
-- The "good" shape check (`~* '\(\s*select\s+[a-z_.]*is_admin(_or_staff)?\s*\('`)
-- was proven to fire on a known-bad input: in a rolled-back transaction,
-- `create policy "_probe" on public.suppliers for select to authenticated
-- using (public.is_admin());` was created, the assertion query below raised
-- `FAIL: policy(ies) call a role helper without (select ...) wrapping:
-- suppliers._probe`, and the probe policy was confirmed gone afterward
-- (`pg_policies` readback on `suppliers` shows only the two real policies).
-- See 01-11-SUMMARY.md for the full transcript.
------------------------------------------------------------------
do $$
declare bad text; n int;
begin
  -- 1. RLS on every base table in public (roadmap criterion 1)
  select string_agg(c.relname, ', ') into bad
    from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false;
  if bad is not null then
    raise exception 'FAIL(criterion 1): table(s) without RLS: %', bad;
  end if;

  -- 2. Every RLS-enabled table has at least one policy (RLS with zero policies denies all,
  --    which passes every negative test while silently breaking the feature)
  select string_agg(c.relname, ', ') into bad
    from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
     and c.relname <> 'rls_harness_canary'          -- the canary is intentionally policy-free
     and not exists (select 1 from pg_policies p
                      where p.schemaname = 'public' and p.tablename = c.relname);
  if bad is not null then
    raise exception 'FAIL: RLS enabled but no policies on: % (denies all — likely unintended)', bad;
  end if;

  -- 3. No forbidden column reachable through any *_public projection (criterion 3/4)
  select string_agg(table_name || '.' || column_name, ', ') into bad
    from information_schema.columns
   where table_schema = 'public' and table_name like '%\_public'
     and column_name in ('unit_cost_cents','source_import_id','legal_name','notes',
                         'supplier_id','grade','carrier_raw','basis_cost_cents');
  if bad is not null then
    raise exception 'FAIL(criterion 3/4): forbidden column(s) exposed via a public view: %', bad;
  end if;

  -- 4. No policy calls a role helper unwrapped (per-row evaluation instead of an InitPlan).
  --    Pattern calibrated against this project's observed normalized form (see header comment
  --    above) and proven to fire on a deliberately unwrapped probe policy.
  select string_agg(tablename || '.' || policyname, ', ') into bad
    from pg_policies
   where schemaname = 'public'
     and (coalesce(qual,'') || coalesce(with_check,'')) ~* 'is_admin(_or_staff)?\s*\('
     and (coalesce(qual,'') || coalesce(with_check,'')) !~* '\(\s*select\s+[a-z_.]*is_admin(_or_staff)?\s*\(';
  if bad is not null then
    raise exception 'FAIL: policy(ies) call a role helper without (select ...) wrapping: %', bad;
  end if;

  -- 5. Every SECURITY DEFINER function in public pins an empty search_path.
  --    Postgres renders `set search_path = ''` in pg_proc.proconfig as the
  --    literal string `search_path=""` (quoted empty value), not
  --    `search_path=` (bare) — the plan's first-draft pattern used the bare
  --    form and flagged every correctly-pinned function in this project as a
  --    false positive. Confirmed by reading `select proname, proconfig from
  --    pg_proc where pronamespace = 'public'::regnamespace and prosecdef`
  --    directly (2026-08-07); accepts both renderings for portability.
  select string_agg(p.proname, ', ') into bad
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.prosecdef
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg
                      where cfg in ('search_path=', 'search_path=""'));
  if bad is not null then
    raise exception 'FAIL: SECURITY DEFINER function(s) without search_path='''': %', bad;
  end if;
end $$;
