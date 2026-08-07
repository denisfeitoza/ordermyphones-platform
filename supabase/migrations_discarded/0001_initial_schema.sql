-- 0001_initial_schema.sql
-- Enums, identity, accounts, tiers, catalog, suppliers, sales skeleton.
-- See docs/architecture/DATA-MODEL.md.

set check_function_bodies = off;

create extension if not exists "pgcrypto";

------------------------------------------------------------
-- Enums
------------------------------------------------------------
create type user_role             as enum ('customer', 'staff', 'admin');
create type account_type          as enum ('individual', 'business');
create type membership_role       as enum ('owner', 'buyer', 'viewer');
create type product_status        as enum ('draft', 'published', 'archived');
create type variant_condition     as enum ('new', 'cpo', 'refurbished', 'used_a', 'used_b', 'used_c');
create type supplier_kind         as enum ('dropship', 'wholesale');
create type order_status          as enum (
  'draft', 'pending_payment', 'paid', 'fulfilling',
  'shipped', 'delivered', 'canceled', 'refunded'
);
create type payment_status        as enum (
  'pending', 'succeeded', 'refunded', 'failed', 'partial_refund'
);
create type shipment_status       as enum (
  'queued', 'in_transit', 'delivered', 'exception', 'returned'
);
create type ticket_status         as enum ('open', 'pending', 'resolved', 'closed');
create type ticket_author_kind    as enum ('customer', 'staff', 'ai_draft');

------------------------------------------------------------
-- Helper: keep updated_at in sync
------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

------------------------------------------------------------
-- Identity
------------------------------------------------------------
create table public.users (
  id            uuid primary key,
  email         text unique not null,
  display_name  text,
  role          user_role not null default 'customer',
  phone         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create trigger trg_users_updated before update on public.users
  for each row execute function set_updated_at();

------------------------------------------------------------
-- Tiers (seeded in seed.sql)
------------------------------------------------------------
create table public.tiers (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null check (code in ('tier_1','tier_2','tier_3','tier_4')),
  label       text not null,
  min_units   int  not null,
  max_units   int,
  position    int  not null
);

------------------------------------------------------------
-- Accounts
------------------------------------------------------------
create table public.accounts (
  id                              uuid primary key default gen_random_uuid(),
  display_name                    text not null,
  type                            account_type not null default 'individual',
  legal_name                      text,
  tax_id                          text,
  tier_id                         uuid references public.tiers(id),
  cumulative_units_last_window    int not null default 0,
  preferences                     jsonb not null default '{}'::jsonb,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  deleted_at                      timestamptz
);
create trigger trg_accounts_updated before update on public.accounts
  for each row execute function set_updated_at();

create table public.account_memberships (
  account_id  uuid references public.accounts(id) on delete cascade,
  user_id     uuid references public.users(id)    on delete cascade,
  role        membership_role not null default 'owner',
  created_at  timestamptz not null default now(),
  primary key (account_id, user_id)
);

------------------------------------------------------------
-- Catalog
------------------------------------------------------------
create table public.products (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique not null,
  brand             text not null,
  model             text not null,
  summary           text,
  description       text,
  hero_image_path   text,
  viewer_3d_path    text,
  status            product_status not null default 'draft',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);
create trigger trg_products_updated before update on public.products
  for each row execute function set_updated_at();

create table public.product_variants (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  sku         text unique not null,
  color       text,
  storage_gb  int,
  condition   variant_condition not null default 'new',
  attributes  jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

------------------------------------------------------------
-- Suppliers
------------------------------------------------------------
create table public.suppliers (
  id            uuid primary key default gen_random_uuid(),
  code          text unique not null check (code in ('source-1','source-2')),
  display_name  text not null,
  country       text not null,
  kind          supplier_kind not null,
  is_active     boolean not null default true,
  notes         text,
  created_at    timestamptz not null default now()
);

------------------------------------------------------------
-- Sales (skeleton)
------------------------------------------------------------
create table public.carts (
  id                   uuid primary key default gen_random_uuid(),
  account_id           uuid not null references public.accounts(id) on delete cascade,
  effective_tier_id    uuid references public.tiers(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create trigger trg_carts_updated before update on public.carts
  for each row execute function set_updated_at();

create table public.cart_items (
  id                uuid primary key default gen_random_uuid(),
  cart_id           uuid not null references public.carts(id) on delete cascade,
  variant_id        uuid not null references public.product_variants(id),
  qty               int  not null check (qty >= 1),
  unit_price_cents  bigint not null check (unit_price_cents >= 0)
);

create table public.orders (
  id                          uuid primary key default gen_random_uuid(),
  account_id                  uuid not null references public.accounts(id),
  placed_by_user_id           uuid not null references public.users(id),
  status                      order_status not null default 'draft',
  tier_id_at_order            uuid references public.tiers(id),
  subtotal_cents              bigint not null default 0 check (subtotal_cents >= 0),
  tax_cents                   bigint not null default 0 check (tax_cents >= 0),
  shipping_cents              bigint not null default 0 check (shipping_cents >= 0),
  total_cents                 bigint not null default 0 check (total_cents >= 0),
  currency                    text not null default 'USD',
  stripe_session_id           text,
  stripe_payment_intent_id    text unique,
  notes                       text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
create trigger trg_orders_updated before update on public.orders
  for each row execute function set_updated_at();

create index idx_orders_active
  on public.orders (account_id)
  where status not in ('canceled', 'refunded');

create table public.order_items (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders(id) on delete cascade,
  variant_id        uuid not null references public.product_variants(id),
  qty               int  not null check (qty >= 1),
  unit_price_cents  bigint not null check (unit_price_cents >= 0),
  supplier_id       uuid references public.suppliers(id)
);

create table public.shipments (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders(id) on delete cascade,
  carrier           text,
  tracking_number   text,
  status            shipment_status not null default 'queued',
  last_event_at     timestamptz,
  last_event_raw    jsonb,
  created_at        timestamptz not null default now()
);

create table public.payments (
  id                          uuid primary key default gen_random_uuid(),
  order_id                    uuid not null references public.orders(id) on delete cascade,
  stripe_payment_intent_id    text not null unique,
  amount_cents                bigint not null check (amount_cents >= 0),
  currency                    text not null default 'USD',
  status                      payment_status not null default 'pending',
  raw_event                   jsonb,
  created_at                  timestamptz not null default now()
);

------------------------------------------------------------
-- Customer engagement (tickets)
------------------------------------------------------------
create table public.tickets (
  id                  uuid primary key default gen_random_uuid(),
  account_id          uuid not null references public.accounts(id) on delete cascade,
  subject             text not null,
  status              ticket_status not null default 'open',
  assignee_user_id    uuid references public.users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create trigger trg_tickets_updated before update on public.tickets
  for each row execute function set_updated_at();

create table public.ticket_messages (
  id                uuid primary key default gen_random_uuid(),
  ticket_id         uuid not null references public.tickets(id) on delete cascade,
  author_user_id    uuid references public.users(id),
  author_kind       ticket_author_kind not null default 'customer',
  body              text not null,
  attachments       jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now()
);

------------------------------------------------------------
-- Mirror auth.users → public.users
------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, display_name, role)
  values (new.id, lower(new.email), new.raw_user_meta_data ->> 'display_name', 'customer')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
