-- 0003_pricing_tiers.sql
-- price_rules, prices, materialization.

create type price_rule_scope as enum ('global', 'product', 'variant');
create type price_rule_kind  as enum ('absolute', 'percentage_off', 'margin_floor');

create table public.price_rules (
  id              uuid primary key default gen_random_uuid(),
  scope           price_rule_scope not null,
  target_id       uuid,
  tier_id         uuid not null references public.tiers(id),
  kind            price_rule_kind not null,
  value_cents     bigint check (value_cents is null or value_cents >= 0),
  value_bps       int    check (value_bps   is null or value_bps   >= 0),
  priority        int not null default 0,
  effective_from  timestamptz,
  effective_to    timestamptz,
  created_at      timestamptz not null default now()
);

create index idx_price_rules_lookup on public.price_rules (scope, target_id, tier_id, priority desc);

create table public.prices (
  variant_id   uuid not null references public.product_variants(id) on delete cascade,
  tier_id      uuid not null references public.tiers(id),
  price_cents  bigint not null check (price_cents >= 0),
  currency     text not null default 'USD',
  updated_at   timestamptz not null default now(),
  primary key (variant_id, tier_id)
);

-- RLS
alter table public.price_rules enable row level security;
alter table public.prices      enable row level security;

create policy "price_rules admin read"
  on public.price_rules for select using (public.is_admin_or_staff());

create policy "price_rules admin write"
  on public.price_rules for all
  using (public.is_admin()) with check (public.is_admin());

create policy "prices public read"
  on public.prices for select using (true);

-- prices writes are service_role only (refreshed by materialization function)

create or replace function public.refresh_prices_for_variant(_variant_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  refreshed int := 0;
begin
  -- v1 implementation lands in Phase 2.
  -- Sketch:
  --   for each tier:
  --     compute the effective price by walking price_rules
  --     in priority order (variant > product > global), respecting margin floor;
  --   upsert into prices(variant_id, tier_id, price_cents, currency).
  --
  -- See docs/architecture/PRICING-ENGINE.md §3.
  perform 1; -- placeholder to keep the function valid
  return refreshed;
end $$;
