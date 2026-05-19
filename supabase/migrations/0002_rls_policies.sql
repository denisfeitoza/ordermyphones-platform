-- 0002_rls_policies.sql
-- RLS enabled on every table; policies per role.
-- See docs/architecture/AUTH-AND-RLS.md.

set check_function_bodies = off;

------------------------------------------------------------
-- Helper functions
------------------------------------------------------------
create or replace function public.current_user_role()
returns text
language sql stable
security definer
set search_path = public
as $$
  select role::text from public.users where id = auth.uid() limit 1
$$;

create or replace function public.is_account_member(_account_id uuid)
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.account_memberships
    where account_id = _account_id and user_id = auth.uid()
  )
$$;

create or replace function public.is_admin_or_staff()
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select public.current_user_role() in ('admin', 'staff')
$$;

create or replace function public.is_admin()
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select public.current_user_role() = 'admin'
$$;

------------------------------------------------------------
-- Enable RLS on every table
------------------------------------------------------------
alter table public.users                enable row level security;
alter table public.accounts             enable row level security;
alter table public.account_memberships  enable row level security;
alter table public.tiers                enable row level security;
alter table public.products             enable row level security;
alter table public.product_variants     enable row level security;
alter table public.suppliers            enable row level security;
alter table public.carts                enable row level security;
alter table public.cart_items           enable row level security;
alter table public.orders               enable row level security;
alter table public.order_items          enable row level security;
alter table public.shipments            enable row level security;
alter table public.payments             enable row level security;
alter table public.tickets              enable row level security;
alter table public.ticket_messages      enable row level security;

------------------------------------------------------------
-- users
------------------------------------------------------------
create policy "users read self or admin"
  on public.users for select
  using (auth.uid() = id or public.is_admin_or_staff());

create policy "users update self"
  on public.users for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "admin update roles"
  on public.users for update
  using (public.is_admin())
  with check (public.is_admin());

------------------------------------------------------------
-- accounts
------------------------------------------------------------
create policy "accounts member read"
  on public.accounts for select
  using (public.is_account_member(id) or public.is_admin_or_staff());

create policy "accounts owner update"
  on public.accounts for update
  using (
    exists (
      select 1 from public.account_memberships m
      where m.account_id = accounts.id and m.user_id = auth.uid() and m.role = 'owner'
    ) or public.is_admin()
  )
  with check (true);

------------------------------------------------------------
-- account_memberships
------------------------------------------------------------
create policy "memberships read by same account or admin"
  on public.account_memberships for select
  using (public.is_account_member(account_id) or public.is_admin_or_staff());

create policy "memberships owner write"
  on public.account_memberships for all
  using (
    exists (
      select 1 from public.account_memberships m
      where m.account_id = account_memberships.account_id
        and m.user_id = auth.uid()
        and m.role = 'owner'
    ) or public.is_admin()
  )
  with check (true);

------------------------------------------------------------
-- tiers
------------------------------------------------------------
create policy "tiers public read"
  on public.tiers for select using (true);

create policy "tiers admin write"
  on public.tiers for all
  using (public.is_admin()) with check (public.is_admin());

------------------------------------------------------------
-- products
------------------------------------------------------------
create policy "products public read published"
  on public.products for select
  using (status = 'published' or public.is_admin_or_staff());

create policy "products admin write"
  on public.products for all
  using (public.is_admin()) with check (public.is_admin());

------------------------------------------------------------
-- product_variants
------------------------------------------------------------
create policy "variants read when parent published"
  on public.product_variants for select
  using (
    exists (
      select 1 from public.products p
      where p.id = product_variants.product_id
        and (p.status = 'published' or public.is_admin_or_staff())
    )
  );

create policy "variants admin write"
  on public.product_variants for all
  using (public.is_admin()) with check (public.is_admin());

------------------------------------------------------------
-- suppliers
------------------------------------------------------------
create policy "suppliers admin read"
  on public.suppliers for select using (public.is_admin_or_staff());

create policy "suppliers admin write"
  on public.suppliers for all
  using (public.is_admin()) with check (public.is_admin());

------------------------------------------------------------
-- carts + cart_items
------------------------------------------------------------
create policy "carts member access"
  on public.carts for all
  using (public.is_account_member(account_id) or public.is_admin_or_staff())
  with check (public.is_account_member(account_id) or public.is_admin_or_staff());

create policy "cart_items via cart"
  on public.cart_items for all
  using (
    exists (
      select 1 from public.carts c
      where c.id = cart_items.cart_id
        and (public.is_account_member(c.account_id) or public.is_admin_or_staff())
    )
  )
  with check (true);

------------------------------------------------------------
-- orders + order_items + shipments + payments
------------------------------------------------------------
create policy "orders account read"
  on public.orders for select
  using (public.is_account_member(account_id) or public.is_admin_or_staff());

create policy "orders member create draft"
  on public.orders for insert
  with check (
    public.is_account_member(account_id) and status = 'draft'
  );

create policy "orders admin transitions"
  on public.orders for update
  using (public.is_admin_or_staff())
  with check (public.is_admin_or_staff());

create policy "order_items follow order read"
  on public.order_items for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and (public.is_account_member(o.account_id) or public.is_admin_or_staff())
    )
  );

-- order_items writes are service_role only (no policy for authenticated)

create policy "shipments read via order"
  on public.shipments for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = shipments.order_id
        and (public.is_account_member(o.account_id) or public.is_admin_or_staff())
    )
  );

create policy "payments read via order"
  on public.payments for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = payments.order_id
        and (public.is_account_member(o.account_id) or public.is_admin_or_staff())
    )
  );

------------------------------------------------------------
-- tickets
------------------------------------------------------------
create policy "tickets account read"
  on public.tickets for select
  using (public.is_account_member(account_id) or public.is_admin_or_staff());

create policy "tickets account create"
  on public.tickets for insert
  with check (public.is_account_member(account_id));

create policy "tickets admin transitions"
  on public.tickets for update
  using (public.is_admin_or_staff()) with check (public.is_admin_or_staff());

create policy "ticket_messages via ticket"
  on public.ticket_messages for select
  using (
    exists (
      select 1 from public.tickets t
      where t.id = ticket_messages.ticket_id
        and (public.is_account_member(t.account_id) or public.is_admin_or_staff())
    )
  );

create policy "ticket_messages author writes"
  on public.ticket_messages for insert
  with check (
    -- customer authors own messages; admin/staff can post on any ticket
    (author_user_id = auth.uid() and author_kind = 'customer')
    or public.is_admin_or_staff()
  );
