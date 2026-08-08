-- #06 Address book: a real, per-user catalog of ship-to addresses so a buyer
-- saves once, picks at checkout, and never re-types. RLS is self-scoped only —
-- admin/staff fulfill from the order's own shipping_address snapshot, so they
-- never need to read a customer's book (privacy-preserving, D16-aligned).
-- The order snapshot stays {street,city,state,zip}; place_order is unchanged.
create table if not exists public.addresses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  label      text,
  recipient  text,
  street     text not null,
  city       text not null,
  state      text not null,
  zip        text not null,
  phone      text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists addresses_user_idx on public.addresses(user_id);

alter table public.addresses enable row level security;

drop policy if exists addresses_select on public.addresses;
create policy addresses_select on public.addresses for select using (user_id = auth.uid());
drop policy if exists addresses_insert on public.addresses;
create policy addresses_insert on public.addresses for insert with check (user_id = auth.uid());
drop policy if exists addresses_update on public.addresses;
create policy addresses_update on public.addresses for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists addresses_delete on public.addresses;
create policy addresses_delete on public.addresses for delete using (user_id = auth.uid());

grant select, insert, update, delete on public.addresses to authenticated;

create or replace function public.addresses_enforce_default()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and not exists (select 1 from public.addresses where user_id = new.user_id) then
    new.is_default := true;
  end if;
  if new.is_default then
    update public.addresses set is_default = false, updated_at = now()
      where user_id = new.user_id and id <> new.id and is_default;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists addresses_default_biu on public.addresses;
create trigger addresses_default_biu before insert or update on public.addresses
  for each row execute function public.addresses_enforce_default();

create or replace function public.addresses_promote_after_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.is_default then
    update public.addresses set is_default = true, updated_at = now()
      where id = (select id from public.addresses where user_id = old.user_id order by created_at desc limit 1);
  end if;
  return old;
end $$;

drop trigger if exists addresses_promote_ad on public.addresses;
create trigger addresses_promote_ad after delete on public.addresses
  for each row execute function public.addresses_promote_after_delete();

insert into public.addresses (user_id, label, recipient, street, city, state, zip, phone, is_default)
select p.id, 'Default', nullif(trim(p.display_name), ''),
       trim(p.shipping_address->>'street'), trim(p.shipping_address->>'city'),
       trim(p.shipping_address->>'state'), trim(p.shipping_address->>'zip'),
       nullif(trim(coalesce(p.phone, '')), ''), true
from public.profiles p
where nullif(trim(p.shipping_address->>'street'), '') is not null
  and nullif(trim(p.shipping_address->>'city'), '') is not null
  and nullif(trim(p.shipping_address->>'state'), '') is not null
  and nullif(trim(p.shipping_address->>'zip'), '') is not null
  and not exists (select 1 from public.addresses a where a.user_id = p.id);
