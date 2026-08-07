-- 20260807210000_admin_config.sql
-- Phase 7 (Admin Configuration Panel & Lenses). Author-only — the orchestrator
-- applies this via the Supabase MCP, not the build agent.
--
-- What this migration adds:
--   * public.admin_audit                       — append-only audit of sensitive
--                                                 admin config/lens actions
--   * public.reprice_all()                     — admin: reprice every variant
--   * public.merge_locations(from,to)          — admin: fold one stock location
--                                                 into another (compensating,
--                                                 audited; source deactivated)
--   * public.set_customer_tier(user,tier,why)  — admin: reassign a customer tier
--   * public.set_user_role(user,role)          — admin: change a user's role
--   * public.resolve_grade_classification(q,ctia)— admin: classify a pending
--                                                 unknown vendor grade + reprice
--   * public.admin_get_customer_profile(user)  — admin read: customer profile
--   * public.admin_get_customer_orders(user)   — admin read: customer orders
--   * public.admin_log_view_as(user)           — admin: record a view-as event
--
-- Conventions (unchanged from every prior migration in this project):
--   * `language plpgsql/sql`, `security definer`, `set search_path = ''`,
--     fully schema-qualified bodies, enum literals cast explicitly.
--   * Every write RPC gates on is_admin() (admin-only for the sensitive ones)
--     as its FIRST statement, and `revoke ... from public, anon; grant ... to
--     authenticated`. Internal calls to public.reprice_variants(uuid[]) work
--     with zero extra grants because that function is SECURITY DEFINER owned by
--     postgres and these callers are too — the exact mechanism
--     set_consumer_benchmark / commit_stock_import already rely on.
--
-- Design note on merge_locations — read before touching it:
--   The stock ledger is append-only by trigger (deny_ledger_mutation fires on
--   UPDATE/DELETE of stock_movements for EVERY role, owner included — it has no
--   current_user escape hatch, unlike guard_profile_privileged_columns), and
--   stock_locations is FK-referenced `on delete restrict` by both inventory and
--   stock_movements. So the brief's literal "repoints inventory+movements to
--   the target and removes the source" is not physically expressible without
--   rewriting audited history and violating a restrict FK. The correct,
--   audit-preserving merge is: write compensating ledger movements that carry
--   each in-stock balance from source to target (reason manual_adjust), lift
--   the target's cost observation to MAX across both locations so the pricing
--   engine's basis cost (MAX unit_cost_cents among in-stock locations,
--   20260807150000) is unchanged, reprice the moved variants, then DEACTIVATE
--   the source (active=false). This deviation is recorded in
--   docs/planning/AUTONOMOUS-DECISIONS.md.

------------------------------------------------------------------
-- A. public.admin_audit — append-only trail for sensitive admin actions.
-- admin-read only (is_admin, not is_admin_or_staff — staff should not see the
-- full config/lens audit). No client write path at all: every writer is a
-- SECURITY DEFINER RPC below running as the table owner. Column privileges are
-- revoked from authenticated/anon so even a future stray policy can't reopen
-- insert/update/delete from PostgREST.
------------------------------------------------------------------
create table public.admin_audit (
  id             uuid primary key default gen_random_uuid(),
  actor_id       uuid references public.profiles(id),
  action         text not null,
  target_user_id uuid references public.profiles(id),
  detail         jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index admin_audit_actor_idx  on public.admin_audit (actor_id, created_at desc);
create index admin_audit_target_idx on public.admin_audit (target_user_id, created_at desc);
create index admin_audit_action_idx on public.admin_audit (action, created_at desc);

comment on table public.admin_audit is
  'Append-only audit of sensitive admin config/lens actions (reprice_all, merge_locations, set_customer_tier, set_user_role, resolve_grade_classification, viewed_as). Admin-read only; written exclusively by the SECURITY DEFINER RPCs in this migration. Never store secrets here.';

alter table public.admin_audit enable row level security;

create policy "admin_audit admin read" on public.admin_audit
  for select to authenticated
  using ( (select public.is_admin()) );

-- No insert/update/delete policy for authenticated — RPCs write as owner.
-- Revoke the DML verbs so the table is untouchable from PostgREST regardless.
revoke insert, update, delete on public.admin_audit from authenticated, anon;

------------------------------------------------------------------
-- B. public.reprice_all() — admin-only full repricing pass. Floors/params
-- edits do NOT auto-reprice existing rows (reprice_variants only runs where an
-- import commit or an admin action triggers it); this is the explicit "apply
-- my new floors/params to everything now" button. Bounded statement_timeout so
-- a large catalog can't hang a PostgREST worker indefinitely.
------------------------------------------------------------------
create or replace function public.reprice_all()
returns integer
language plpgsql
security definer
set search_path = ''
set statement_timeout = '180s'
as $$
declare
  v_ids   uuid[];
  v_count integer;
begin
  if not (select public.is_admin()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select array_agg(id) into v_ids from public.product_variants;
  v_count := coalesce(array_length(v_ids, 1), 0);

  if v_count > 0 then
    perform public.reprice_variants(v_ids);
  end if;

  insert into public.admin_audit (actor_id, action, detail)
  values (auth.uid(), 'reprice_all', jsonb_build_object('variant_count', v_count));

  return v_count;
end;
$$;

comment on function public.reprice_all() is
  'Admin-only. Reprices every product_variant through public.reprice_variants and returns the count. Use after editing tier floors or pricing_settings, which do not retro-reprice on their own. Audited to admin_audit.';

revoke execute on function public.reprice_all() from public, anon;
grant  execute on function public.reprice_all() to authenticated;

------------------------------------------------------------------
-- C. public.merge_locations(p_from_code, p_to_code) — see the design note in
-- the file header. Admin-only. Basis-cost-neutral, audited, source deactivated.
------------------------------------------------------------------
create or replace function public.merge_locations(p_from_code text, p_to_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
-- Bounded like commit_stock_import (which reprices under a 120s budget): the
-- reprice pass over the moved variants is unbounded in principle. A timeout
-- aborts and rolls back the whole merge atomically — the safe failure mode.
set statement_timeout = '180s'
as $$
declare
  v_from          uuid;
  v_to            uuid;
  v_moved_variants uuid[];
  v_moved_count   integer := 0;
  v_moved_units   bigint  := 0;
begin
  if not (select public.is_admin()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if p_from_code is null or p_to_code is null or trim(p_from_code) = '' or trim(p_to_code) = '' then
    raise exception 'both source and target location codes are required';
  end if;
  if p_from_code = p_to_code then
    raise exception 'cannot merge a location into itself';
  end if;

  select id into v_from from public.stock_locations where code = p_from_code;
  select id into v_to   from public.stock_locations where code = p_to_code;
  if v_from is null then raise exception 'unknown source location %', p_from_code; end if;
  if v_to   is null then raise exception 'unknown target location %', p_to_code; end if;

  -- Snapshot the moved set BEFORE writing any movement (the balance-sync
  -- trigger zeros the source rows the moment the out-movements land, so this
  -- must be captured first).
  select array_agg(variant_id), count(*), coalesce(sum(qty), 0)
    into v_moved_variants, v_moved_count, v_moved_units
  from public.inventory
  where location_id = v_from and qty <> 0;

  if v_moved_count > 0 then
    -- 1. Ensure a target inventory row exists for every source variant.
    insert into public.inventory (variant_id, location_id, qty, as_of)
    select s.variant_id, v_to, 0, now()
    from public.inventory s
    where s.location_id = v_from and s.qty <> 0
    on conflict (variant_id, location_id) do nothing;

    -- 2. Lift the target's cost observation to MAX across both locations so
    --    reprice's basis cost (MAX unit_cost_cents among in-stock locations) is
    --    unchanged by the merge; OR the floor flag; carry source_import_id when
    --    the target has none. These columns are NOT maintained by the ledger
    --    trigger (see 20260806120200 note (b)), so they must be set here.
    update public.inventory t
       set unit_cost_cents  = greatest(coalesce(t.unit_cost_cents, s.unit_cost_cents),
                                        coalesce(s.unit_cost_cents, t.unit_cost_cents)),
           qty_is_floor     = t.qty_is_floor or s.qty_is_floor,
           source_import_id = coalesce(t.source_import_id, s.source_import_id)
    from public.inventory s
    where s.location_id = v_from and s.qty <> 0
      and t.location_id = v_to and t.variant_id = s.variant_id;

    -- 3. Compensating movements: out at source, in at target, in ONE statement
    --    so both SELECT arms read the pre-move source balances (the trigger
    --    would zero them between two separate statements). Net effect: source
    --    balances → 0, target balances += source qty. Both legs reference the
    --    source location id so the pair is traceable to this merge.
    insert into public.stock_movements
      (variant_id, location_id, delta, reason, ref_type, ref_id, unit_cost_cents, actor_id, note)
    select s.variant_id, v_from, -s.qty, 'manual_adjust'::public.movement_reason,
           'stock_locations', v_from, s.unit_cost_cents, auth.uid(), 'merge_locations: out'
    from public.inventory s
    where s.location_id = v_from and s.qty <> 0
    union all
    select s.variant_id, v_to, s.qty, 'manual_adjust'::public.movement_reason,
           'stock_locations', v_from, s.unit_cost_cents, auth.uid(), 'merge_locations: in'
    from public.inventory s
    where s.location_id = v_from and s.qty <> 0;

    -- 4. Reprice the moved variants (their in-stock location set just changed).
    perform public.reprice_variants(v_moved_variants);
  end if;

  -- 5. Deactivate the source. Not hard-deleted: the append-only ledger
  --    references it `on delete restrict` (historical movements are facts).
  update public.stock_locations set active = false where id = v_from;

  insert into public.admin_audit (actor_id, action, detail)
  values (auth.uid(), 'merge_locations',
          jsonb_build_object('from_code', p_from_code, 'to_code', p_to_code,
                             'variants_moved', v_moved_count, 'units_moved', v_moved_units,
                             'source_deactivated', true));

  return jsonb_build_object('from_code', p_from_code, 'to_code', p_to_code,
                            'variants_moved', v_moved_count, 'units_moved', v_moved_units,
                            'source_deactivated', true);
end;
$$;

comment on function public.merge_locations(text, text) is
  'Admin-only. Folds source stock location into target: compensating ledger movements carry every in-stock balance across (basis-cost-neutral), moved variants are repriced, and the source is DEACTIVATED (active=false) — not hard-deleted, because the append-only ledger references it on delete restrict. Audited to admin_audit. Returns a summary jsonb.';

revoke execute on function public.merge_locations(text, text) from public, anon;
grant  execute on function public.merge_locations(text, text) to authenticated;

------------------------------------------------------------------
-- D. public.set_customer_tier(p_user_id, p_tier, p_reason) — admin-only tier
-- reassignment. Runs as owner, so it passes guard_profile_privileged_columns
-- (which fences only current_user='authenticated'). No reprice needed: placed
-- orders snapshot tier_at_order (T-01-55), and a customer only ever sees their
-- own assigned tier's live prices, recomputed on read.
------------------------------------------------------------------
create or replace function public.set_customer_tier(
  p_user_id uuid,
  p_tier    public.customer_tier,
  p_reason  text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row  public.profiles;
  v_old  public.customer_tier;
  v_role public.user_role;
begin
  if not (select public.is_admin()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_tier is null then
    raise exception 'tier is required';
  end if;

  select role, tier into v_role, v_old from public.profiles where id = p_user_id;
  if not found then
    raise exception 'unknown user %', p_user_id;
  end if;
  if v_role <> 'customer'::public.user_role then
    raise exception 'only customer accounts carry a tier (user role is %)', v_role;
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

comment on function public.set_customer_tier(uuid, public.customer_tier, text) is
  'Admin-only. Reassigns a customer''s pricing tier (target must have role=customer). No reprice: placed orders keep their tier_at_order snapshot; the customer sees their new tier''s live prices on next read. Audited to admin_audit with the reason.';

revoke execute on function public.set_customer_tier(uuid, public.customer_tier, text) from public, anon;
grant  execute on function public.set_customer_tier(uuid, public.customer_tier, text) to authenticated;

------------------------------------------------------------------
-- E. public.set_user_role(p_user_id, p_role) — admin-only role change with two
-- lockout guards: an admin cannot demote themselves, and the last remaining
-- admin cannot be demoted (either would strand the console with no admin).
------------------------------------------------------------------
create or replace function public.set_user_role(p_user_id uuid, p_role public.user_role)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.profiles;
  v_old public.user_role;
begin
  if not (select public.is_admin()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_role is null then
    raise exception 'role is required';
  end if;

  select role into v_old from public.profiles where id = p_user_id;
  if not found then
    raise exception 'unknown user %', p_user_id;
  end if;

  if p_user_id = auth.uid() and p_role <> 'admin'::public.user_role then
    raise exception 'you cannot remove your own admin role';
  end if;

  if v_old = 'admin'::public.user_role
     and p_role <> 'admin'::public.user_role
     and (select count(*) from public.profiles where role = 'admin'::public.user_role) <= 1 then
    raise exception 'cannot demote the last remaining admin';
  end if;

  update public.profiles
     set role = p_role, updated_at = now()
   where id = p_user_id
  returning * into v_row;

  insert into public.admin_audit (actor_id, action, target_user_id, detail)
  values (auth.uid(), 'set_user_role', p_user_id,
          jsonb_build_object('from', v_old, 'to', p_role));

  return v_row;
end;
$$;

comment on function public.set_user_role(uuid, public.user_role) is
  'Admin-only. Changes a user''s role. Refuses self-demotion and demotion of the last remaining admin (both would leave the console with no admin). Audited to admin_audit.';

revoke execute on function public.set_user_role(uuid, public.user_role) from public, anon;
grant  execute on function public.set_user_role(uuid, public.user_role) to authenticated;

------------------------------------------------------------------
-- F. public.resolve_grade_classification(p_queue_id, p_ctia) — admin-only.
-- Classifies a pending unknown vendor grade: upserts vendor_grade_map, marks
-- the queue row classified, and reprices every variant whose grade text
-- matches. The reprice set uses the SAME predicate reprice_variants and
-- catalog_listing use — match on grade LABEL alone, ignoring vendor_code
-- (upper(trim(...))) — so exactly the variants whose CTIA label just changed
-- are repriced.
------------------------------------------------------------------
create or replace function public.resolve_grade_classification(
  p_queue_id uuid,
  p_ctia     public.ctia_grade
)
returns jsonb
language plpgsql
security definer
set search_path = ''
-- Bounded: a common grade label (e.g. "A") can make the reprice set effectively
-- the whole catalog. A timeout aborts and rolls back atomically, same as
-- commit_stock_import's 120s reprice budget.
set statement_timeout = '180s'
as $$
declare
  v_vendor_code  text;
  v_vendor_grade text;
  v_ids          uuid[];
  v_count        integer;
begin
  if not (select public.is_admin()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_ctia is null then
    raise exception 'a CTIA grade is required';
  end if;

  select vendor_code, vendor_grade into v_vendor_code, v_vendor_grade
  from public.grade_classification_queue where id = p_queue_id;
  if v_vendor_code is null then
    raise exception 'unknown queue id %', p_queue_id;
  end if;

  insert into public.vendor_grade_map (vendor_code, vendor_grade, ctia)
  values (v_vendor_code, v_vendor_grade, p_ctia)
  on conflict (vendor_code, vendor_grade) do update set ctia = excluded.ctia;

  update public.grade_classification_queue
     set status        = 'classified'::public.classification_status,
         resolved_ctia = p_ctia,
         resolved_by   = auth.uid(),
         resolved_at   = now()
   where id = p_queue_id;

  select array_agg(id) into v_ids
  from public.product_variants
  where upper(trim(grade)) = upper(trim(v_vendor_grade));
  v_count := coalesce(array_length(v_ids, 1), 0);

  if v_count > 0 then
    perform public.reprice_variants(v_ids);
  end if;

  insert into public.admin_audit (actor_id, action, detail)
  values (auth.uid(), 'resolve_grade_classification',
          jsonb_build_object('vendor_code', v_vendor_code, 'vendor_grade', v_vendor_grade,
                             'ctia', p_ctia, 'variants_repriced', v_count));

  return jsonb_build_object('vendor_code', v_vendor_code, 'vendor_grade', v_vendor_grade,
                            'ctia', p_ctia, 'variants_repriced', v_count);
end;
$$;

comment on function public.resolve_grade_classification(uuid, public.ctia_grade) is
  'Admin-only. Resolves a pending grade_classification_queue row: upserts vendor_grade_map (vendor_code, vendor_grade -> ctia), marks the queue row classified, and reprices every variant whose grade text matches (same label-only predicate the engine uses). Audited to admin_audit.';

revoke execute on function public.resolve_grade_classification(uuid, public.ctia_grade) from public, anon;
grant  execute on function public.resolve_grade_classification(uuid, public.ctia_grade) to authenticated;

------------------------------------------------------------------
-- G. Admin read RPCs for the read-only "view as customer" lens. Both are pure
-- reads (no audit write — the view-as event is logged ONCE by
-- admin_log_view_as below, so TanStack refetches don't flood admin_audit).
-- SECURITY DEFINER so the admin's own rights fetch the customer's rows without
-- a session swap or impersonation token.
------------------------------------------------------------------
create or replace function public.admin_get_customer_profile(p_user_id uuid)
returns table (
  id           uuid,
  email        text,
  role         public.user_role,
  tier         public.customer_tier,
  is_test      boolean,
  display_name text,
  phone        text,
  locale       text,
  created_at   timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return query
    select p.id, p.email, p.role, p.tier, p.is_test, p.display_name, p.phone, p.locale, p.created_at
    from public.profiles p
    where p.id = p_user_id;
end;
$$;

comment on function public.admin_get_customer_profile(uuid) is
  'Admin-only read for the view-as lens. Returns one customer''s profile via the admin''s own rights — no impersonation. Pure read (not audited here; see admin_log_view_as).';

revoke execute on function public.admin_get_customer_profile(uuid) from public, anon;
grant  execute on function public.admin_get_customer_profile(uuid) to authenticated;

create or replace function public.admin_get_customer_orders(p_user_id uuid)
returns table (
  id            uuid,
  status        public.order_status,
  tier_at_order public.customer_tier,
  subtotal_cents bigint,
  placed_at     timestamptz,
  decided_at    timestamptz,
  notes         text,
  is_test       boolean,
  item_count    integer,
  items         jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return query
    select
      o.id, o.status, o.tier_at_order, o.subtotal_cents, o.placed_at, o.decided_at,
      o.notes, o.is_test,
      count(oi.id)::integer as item_count,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'sku', pv.sku,
            'make', pr.make,
            'model', pr.model,
            'capacity', pv.capacity,
            'color', pv.color,
            'qty_requested', oi.qty_requested,
            'qty_approved', oi.qty_approved,
            'unit_price_cents', oi.unit_price_cents,
            'tier', oi.tier
          ) order by pr.make, pr.model
        ) filter (where oi.id is not null),
        '[]'::jsonb
      ) as items
    from public.orders o
    left join public.order_items oi on oi.order_id = o.id
    left join public.product_variants pv on pv.id = oi.variant_id
    left join public.products pr on pr.id = pv.product_id
    where o.customer_id = p_user_id
    group by o.id
    order by o.placed_at desc;
end;
$$;

comment on function public.admin_get_customer_orders(uuid) is
  'Admin-only read for the view-as lens. Returns one customer''s real orders (with item lines resolved to canonical make/model) via the admin''s own rights — no impersonation. Pure read (not audited here; see admin_log_view_as).';

revoke execute on function public.admin_get_customer_orders(uuid) from public, anon;
grant  execute on function public.admin_get_customer_orders(uuid) to authenticated;

------------------------------------------------------------------
-- H. public.admin_log_view_as(p_user_id) — records ONE view-as event. Called
-- once on lens mount (not on every refetch), keeping the read RPCs pure.
------------------------------------------------------------------
create or replace function public.admin_log_view_as(p_user_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'unknown user %', p_user_id;
  end if;

  insert into public.admin_audit (actor_id, action, target_user_id, detail)
  values (auth.uid(), 'viewed_as', p_user_id, jsonb_build_object('at', now()));
end;
$$;

comment on function public.admin_log_view_as(uuid) is
  'Admin-only. Records a single ''viewed_as'' row in admin_audit. Called once when the view-as lens mounts so the read RPCs stay pure and refetches do not flood the audit.';

revoke execute on function public.admin_log_view_as(uuid) from public, anon;
grant  execute on function public.admin_log_view_as(uuid) to authenticated;

------------------------------------------------------------------
-- I. New app_settings display/config keys the Phase 7 panels read/write.
-- Seeded with sane defaults, on conflict do nothing so re-apply is a no-op and
-- an admin's later edits are never clobbered. Every reader must tolerate a
-- missing key (fall back to these same defaults) — the seed is a convenience,
-- not a guarantee.
--   catalog_qty_display   : "exact" | "ranges"      (D2 default exact)
--   catalog_featured      : { "skus": [], "models": [] }  (curated Featured sort)
--   enforcement_points    : which fields gate at checkout/approval (config only)
------------------------------------------------------------------
insert into public.app_settings (key, value) values
  ('catalog_qty_display', '"exact"'::jsonb),
  ('catalog_featured',    '{"skus":[],"models":[]}'::jsonb),
  ('enforcement_points',  '{"g1_business_name":{"checkout":false,"approval":false},"g2_tax_certificate":{"checkout":false,"approval":true},"shipping_address":{"checkout":true,"approval":false}}'::jsonb)
on conflict (key) do nothing;
