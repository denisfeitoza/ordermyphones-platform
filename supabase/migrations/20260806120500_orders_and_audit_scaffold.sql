-- 20260806120500_orders_and_audit_scaffold.sql
-- Phase 1 Plan 01-09: orders, order_items, reconciliation_queue, audit_log.
-- SCAFFOLD ONLY: tables + constraints + RLS. Approval/deduct-on-approval
-- flow logic is Phase 6 (ORDR-01) — see docs/architecture and 01-CONTEXT.md.
--
-- Status machine is APPROVAL-CENTRIC per D5: pending -> approved |
-- partially_approved | rejected | cancelled. This deliberately does NOT
-- copy DATA-MODEL.md's payment-centric machine — 01-CONTEXT.md explicitly
-- flags that document as superseded on this exact point, and billing is
-- off-system (D8/D4), so there is no payment state at all in this schema.

------------------------------------------------------------------
-- A. Status enum
------------------------------------------------------------------
create type public.order_status as enum
  ('pending', 'approved', 'partially_approved', 'rejected', 'cancelled');

------------------------------------------------------------------
-- B. public.orders
------------------------------------------------------------------
create table public.orders (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid not null references public.profiles(id) on delete restrict,
  status         public.order_status not null default 'pending',
  -- Snapshot, not a live join: a later tier change must not retro-reprice
  -- an already-placed order (T-01-55).
  tier_at_order  public.customer_tier not null,
  subtotal_cents bigint not null default 0 check (subtotal_cents >= 0),
  placed_at      timestamptz not null default now(),
  decided_at     timestamptz,
  decided_by     uuid references public.profiles(id),
  notes          text,
  is_test        boolean not null default false,   -- LNCH-01: reports exclude test rows by default
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- A decided order carries its decision metadata; the invariant that keeps
  -- the approval audit trail honest. Explicitly named so the comment below
  -- doesn't depend on guessing Postgres's auto-naming for a multi-column
  -- table-level check.
  constraint orders_decision_metadata_check check ( (status = 'pending') = (decided_at is null) )
);

create trigger trg_orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

create index orders_customer_placed_idx on public.orders (customer_id, placed_at desc);
create index orders_status_placed_idx   on public.orders (status, placed_at desc);

comment on constraint orders_decision_metadata_check on public.orders is
  'Approval audit trail invariant: a pending order has no decision timestamp, a decided order always does. Do not relax this to backfill a decision after the fact — write the real decided_at.';

------------------------------------------------------------------
-- C. public.order_items
------------------------------------------------------------------
create table public.order_items (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders(id) on delete cascade,
  variant_id        uuid not null references public.product_variants(id) on delete restrict,
  qty_requested     integer not null check (qty_requested > 0),
  -- qty_approved <= qty_requested is what makes partial approval (D5)
  -- expressible and over-approval mathematically impossible. Explicitly
  -- named (Postgres would otherwise auto-name this table-level check
  -- order_items_check, since the expression references two columns).
  qty_approved      integer,
  unit_price_cents  bigint not null check (unit_price_cents > 0),
  tier              public.customer_tier not null,
  created_at        timestamptz not null default now(),
  unique (order_id, variant_id),
  constraint order_items_qty_approved_bounds_check
    check ( qty_approved is null or (qty_approved >= 0 and qty_approved <= qty_requested) )
);

create index order_items_order_id_idx on public.order_items (order_id);

comment on constraint order_items_qty_approved_bounds_check on public.order_items is
  'Makes over-approval (minting stock that was never ordered, T-01-53) a constraint violation rather than an application-logic responsibility.';

------------------------------------------------------------------
-- D. public.reconciliation_queue — where D5's shortfalls land when
-- approval finds less stock than ordered.
------------------------------------------------------------------
create type public.reconciliation_status as enum ('open', 'resolved', 'cancelled');

create table public.reconciliation_queue (
  id             uuid primary key default gen_random_uuid(),
  order_item_id  uuid not null references public.order_items(id) on delete cascade,
  variant_id     uuid not null references public.product_variants(id) on delete restrict,
  location_id    uuid references public.stock_locations(id),
  shortfall_qty  integer not null check (shortfall_qty > 0),
  status         public.reconciliation_status not null default 'open',
  note           text,
  created_at     timestamptz not null default now(),
  resolved_at    timestamptz,
  resolved_by    uuid references public.profiles(id)
);

create index reconciliation_queue_status_idx on public.reconciliation_queue (status, created_at desc);

------------------------------------------------------------------
-- E. public.audit_log — append-only, same two-leg treatment as
-- stock_movements (reusing public.deny_ledger_mutation() from plan 01-05,
-- not duplicating it).
------------------------------------------------------------------
create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles(id),
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index audit_log_entity_idx on public.audit_log (entity_type, entity_id, created_at desc);
create index audit_log_actor_idx  on public.audit_log (actor_id, created_at desc);

comment on table public.audit_log is
  'Append-only. Phase 7''s "admin X viewed as Y" lens rows land here, along with every audited pricing override and Phase 6 approval decision.';

revoke update, delete on public.audit_log from authenticated, anon;

create trigger trg_audit_log_append_only
  before update or delete on public.audit_log
  for each row execute function public.deny_ledger_mutation();

------------------------------------------------------------------
-- F. RLS — all four tables, this same migration (D15, no exceptions).
------------------------------------------------------------------
alter table public.orders               enable row level security;
alter table public.order_items          enable row level security;
alter table public.reconciliation_queue enable row level security;
alter table public.audit_log            enable row level security;

-- orders: owner reads own, staff read all, owner creates own (pending
-- only), only staff decide. No customer UPDATE policy at all — a customer
-- cannot approve their own order (T-01-51), which is the whole point of
-- D5. Cancellation by the customer is a Phase 6 decision; left out rather
-- than guessing at a policy that would also let them mutate status to
-- 'approved'.
create policy "orders own read" on public.orders for select to authenticated
  using ( customer_id = (select auth.uid()) or (select public.is_admin_or_staff()) );

create policy "orders own insert" on public.orders for insert to authenticated
  with check ( customer_id = (select auth.uid()) and status = 'pending' );

create policy "orders staff update" on public.orders for update to authenticated
  using ( (select public.is_admin_or_staff()) ) with check ( (select public.is_admin_or_staff()) );

-- order_items: ownership resolves through the parent order.
create policy "order items own read" on public.order_items for select to authenticated
  using ( exists (
    select 1 from public.orders o
     where o.id = order_id
       and (o.customer_id = (select auth.uid()) or (select public.is_admin_or_staff()))
  ) );

create policy "order items own insert" on public.order_items for insert to authenticated
  with check ( exists (
    select 1 from public.orders o
     where o.id = order_id
       and o.customer_id = (select auth.uid())
       and o.status = 'pending'
  ) );

create policy "order items staff update" on public.order_items for update to authenticated
  using ( (select public.is_admin_or_staff()) ) with check ( (select public.is_admin_or_staff()) );

-- reconciliation_queue, audit_log: admin/staff read only; no client write
-- path at all — rows are written by Phase 6 logic running as a definer
-- function or by the service role.
create policy "reconciliation_queue staff read" on public.reconciliation_queue
  for select to authenticated using ( (select public.is_admin_or_staff()) );

create policy "audit_log staff read" on public.audit_log
  for select to authenticated using ( (select public.is_admin_or_staff()) );
