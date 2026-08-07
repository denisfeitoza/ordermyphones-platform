-- 0004_supplier_sync.sql
-- inventory_snapshots, supplier_sync_runs, advisory-lock helper.

create type supplier_sync_kind   as enum ('catalog', 'inventory', 'prices');
create type supplier_sync_status as enum ('running', 'success', 'failed', 'partial');

create table public.inventory_snapshots (
  id                uuid primary key default gen_random_uuid(),
  variant_id        uuid not null references public.product_variants(id) on delete cascade,
  supplier_id       uuid not null references public.suppliers(id),
  available_qty     int  not null check (available_qty >= 0),
  unit_cost_cents   bigint not null check (unit_cost_cents >= 0),
  currency          text not null default 'USD',
  as_of             timestamptz not null default now(),
  raw               jsonb not null default '{}'::jsonb
);

create index idx_inventory_snapshots_latest
  on public.inventory_snapshots (variant_id, supplier_id, as_of desc);

create table public.supplier_sync_runs (
  id              uuid primary key default gen_random_uuid(),
  supplier_id     uuid not null references public.suppliers(id),
  kind            supplier_sync_kind not null,
  started_at      timestamptz,
  ended_at        timestamptz,
  rows_seen       int not null default 0,
  rows_upserted   int not null default 0,
  rows_failed     int not null default 0,
  status          supplier_sync_status not null,
  error_summary   text,
  created_at      timestamptz not null default now()
);

-- RLS
alter table public.inventory_snapshots enable row level security;
alter table public.supplier_sync_runs  enable row level security;

create policy "snapshots admin read"
  on public.inventory_snapshots for select using (public.is_admin_or_staff());

create policy "sync_runs admin read"
  on public.supplier_sync_runs for select using (public.is_admin_or_staff());

-- Writes are service_role only (supplier adapters).

------------------------------------------------------------
-- Advisory lock helper for the supplier adapters
------------------------------------------------------------
create or replace function public.try_lock_sync(_supplier_id uuid, _kind text)
returns boolean
language sql
as $$
  select pg_try_advisory_lock(
    hashtextextended(_supplier_id::text || ':' || _kind, 0)
  )
$$;
