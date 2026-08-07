-- 20260806120200_stock_locations_inventory_ledger.sql
-- Phase 1 Plan 01-05: stock_locations, the materialized inventory balance,
-- and the append-only stock_movements ledger, per
-- docs/architecture/SMART-STOCK-IMPORT.md and 01-CONTEXT.md's
-- client-resolved decision "balance(variant, location) = sum of audited
-- movements". RLS enabled on all three tables in this same migration.

------------------------------------------------------------------
-- A. public.stock_locations
------------------------------------------------------------------
-- supplier_id is deliberately NOT added here — public.suppliers does not
-- exist yet. Plan 01-07 adds the column and its FK via ALTER TABLE.
create table public.stock_locations (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,   -- e.g. TX1, TN1, W23-ATT
  display_name text not null,          -- e.g. "Texas" — customer-visible (D6)
  region       text,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger trg_stock_locations_set_updated_at
  before update on public.stock_locations
  for each row execute function public.set_updated_at();

comment on table public.stock_locations is
  'supplier_id is added by plan 01-07 via ALTER TABLE once public.suppliers exists.';

------------------------------------------------------------------
-- B. public.inventory — materialized balance (read cache, NOT the authority)
------------------------------------------------------------------
create table public.inventory (
  id               uuid primary key default gen_random_uuid(),
  variant_id       uuid not null references public.product_variants(id) on delete restrict,
  location_id      uuid not null references public.stock_locations(id) on delete restrict,
  qty              integer not null default 0 check (qty >= 0),
  qty_is_floor     boolean not null default false,
  unit_cost_cents  bigint check (unit_cost_cents is null or unit_cost_cents > 0),
  currency         text not null default 'USD',
  as_of            timestamptz not null default now(),
  source_import_id uuid,
  unique (variant_id, location_id)
);

comment on table public.inventory is
  'Balance cache — the ledger in public.stock_movements is the source of truth (CONTEXT.md, client-resolved 2026-08-06). qty is kept in sync by trg_apply_movement_to_inventory below; never write qty directly outside that trigger.';

comment on column public.inventory.qty_is_floor is
  'True when the vendor feed masks the real quantity (e.g. "200+") — qty is a floor, not an exact count.';

comment on column public.inventory.unit_cost_cents is
  'Latest observed unit cost from the import writer (Phase 2). Property of the latest observation, not of any single delta, so it is set by the import writer directly — the balance-sync trigger does not touch it.';

------------------------------------------------------------------
-- C. public.stock_movements — the append-only ledger (source of truth)
------------------------------------------------------------------
create type public.movement_reason as enum
  ('import_adjust', 'import_replace', 'order_approval', 'manual_adjust', 'reconciliation', 'seed');

create table public.stock_movements (
  id              uuid primary key default gen_random_uuid(),
  variant_id      uuid not null references public.product_variants(id) on delete restrict,
  location_id     uuid not null references public.stock_locations(id) on delete restrict,
  delta           integer not null check (delta <> 0),
  reason          public.movement_reason not null,
  ref_type        text,
  ref_id          uuid,
  unit_cost_cents bigint check (unit_cost_cents is null or unit_cost_cents > 0),
  -- Nullable: Phase 2 import commits run under a job identity that does not
  -- exist yet. Phase 2 must populate actor_id or (ref_type, ref_id) on every
  -- import movement it writes — tracked as a Phase 2 obligation (T-01-28).
  actor_id        uuid references public.profiles(id),
  note            text,
  created_at      timestamptz not null default now()
);

create index stock_movements_variant_location_created_idx
  on public.stock_movements (variant_id, location_id, created_at desc);

comment on table public.stock_movements is
  'Append-only movement ledger — the single source of truth for inventory balance. public.inventory.qty is a materialized cache derived from this table, never the reverse.';

------------------------------------------------------------------
-- D. Append-only enforcement — two legs, because a ledger that can be
-- edited is not a ledger. Blocks the table owner and service_role too:
-- that is intentional. A genuine correction is a compensating movement; a
-- genuine schema repair drops this trigger deliberately in its own migration.
------------------------------------------------------------------
revoke update, delete on public.stock_movements from authenticated, anon;

create or replace function public.deny_ledger_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'stock_movements is append-only; write a compensating movement instead'
    using errcode = '42501';
end;
$$;

create trigger trg_stock_movements_append_only
  before update or delete on public.stock_movements
  for each row execute function public.deny_ledger_mutation();

revoke execute on function public.deny_ledger_mutation() from public, anon, authenticated;

------------------------------------------------------------------
-- E. Balance-sync trigger — keeps inventory.qty equal to the ledger sum
------------------------------------------------------------------
create or replace function public.apply_movement_to_inventory()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Deliberately NOT a single "INSERT ... ON CONFLICT DO UPDATE SET qty =
  -- inventory.qty + excluded.qty" — Postgres validates CHECK constraints on
  -- the proposed INSERT tuple (qty = new.delta literally) BEFORE attempting
  -- conflict resolution, so a negative new.delta trips `qty >= 0` on the
  -- candidate row even when the correctly-summed final value would be
  -- non-negative (e.g. existing 75, delta -10 -> candidate qty=-10 fails
  -- the check before the update path ever runs, even though 75-10=65 is
  -- valid). Verified empirically while executing this plan. Splitting into
  -- ensure-row-exists (candidate qty=0, always passes) + a separate UPDATE
  -- means the check constraint is evaluated exactly once, against the real
  -- final merged value.
  insert into public.inventory (variant_id, location_id, qty, as_of)
  values (new.variant_id, new.location_id, 0, now())
  on conflict (variant_id, location_id) do nothing;

  update public.inventory
     set qty   = qty + new.delta,
         as_of = now()
   where variant_id = new.variant_id
     and location_id = new.location_id;

  -- Guard against silent divergence: if the UPDATE somehow matches zero
  -- rows (should be impossible given the insert-do-nothing above ensures
  -- the row exists), the movement would still commit while the balance
  -- cache stays stale — breaking "balance = sum of audited movements" with
  -- no error. Fail loudly instead.
  if not found then
    raise exception 'inventory row missing for (%, %) — balance cache would diverge from the ledger', new.variant_id, new.location_id;
  end if;

  return new;
end;
$$;

create trigger trg_apply_movement_to_inventory
  after insert on public.stock_movements
  for each row execute function public.apply_movement_to_inventory();

revoke execute on function public.apply_movement_to_inventory() from public, anon, authenticated;

-- Two consequences of this design, recorded here:
-- (a) inventory.qty >= 0 (check constraint above) means a movement that
--     would drive the balance negative FAILS the constraint and ABORTS the
--     whole transaction — this is the correct behaviour for Phase 6's
--     approval-time deduct (D5: approval validates against the live
--     balance), not a bug to work around.
-- (b) unit_cost_cents, qty_is_floor and source_import_id on inventory are
--     set by the import writer (Phase 2) directly, NOT by this trigger,
--     because they are properties of the latest observation rather than of
--     any single delta.

------------------------------------------------------------------
-- F. Verification helper — used by tests and by Phase 6 reconciliation
------------------------------------------------------------------
create or replace function public.ledger_balance(p_variant uuid, p_location uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(delta), 0)::integer
  from public.stock_movements
  where variant_id = p_variant and location_id = p_location
$$;

-- No grant to authenticated: unlike the four role helpers in 01-01, nothing
-- in an RLS policy invokes this function, so there is no reason for a
-- logged-in customer to be able to RPC it directly. It is SECURITY DEFINER
-- and therefore bypasses RLS entirely — granting it to authenticated would
-- let any customer read exact per-location stock for any (variant,
-- location) pair via /rest/v1/rpc/ledger_balance. Tests (rls_suite.sql) and
-- Phase 6 reconciliation both run as table owner / service_role, which
-- already bypass RLS and need no grant.
revoke execute on function public.ledger_balance(uuid, uuid) from public, anon, authenticated;

------------------------------------------------------------------
-- G. RLS — all three tables, this same migration (D15, no exceptions).
-- Same staff/admin-only shape as Task 1. No customer policies; the
-- customer projection is inventory_public, landing in plan 01-07.
------------------------------------------------------------------
alter table public.stock_locations enable row level security;
alter table public.inventory       enable row level security;
alter table public.stock_movements enable row level security;

create policy "stock_locations staff read" on public.stock_locations
  for select to authenticated
  using ( (select public.is_admin_or_staff()) );
create policy "stock_locations staff write" on public.stock_locations
  for all to authenticated
  using ( (select public.is_admin_or_staff()) )
  with check ( (select public.is_admin_or_staff()) );

create policy "inventory staff read" on public.inventory
  for select to authenticated
  using ( (select public.is_admin_or_staff()) );
create policy "inventory staff write" on public.inventory
  for all to authenticated
  using ( (select public.is_admin_or_staff()) )
  with check ( (select public.is_admin_or_staff()) );

create policy "stock_movements staff read" on public.stock_movements
  for select to authenticated
  using ( (select public.is_admin_or_staff()) );
-- INSERT only (append-only ledger) — no UPDATE/DELETE policy is needed
-- because Section D already revokes those privileges and the trigger
-- unconditionally blocks them regardless of role.
create policy "stock_movements staff insert" on public.stock_movements
  for insert to authenticated
  with check ( (select public.is_admin_or_staff()) );
