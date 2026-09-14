-- 20260807233141_access_requests.sql
-- RECONSTRUCTED 2026-09-13 from the production schema (audit P1-16): this
-- migration was applied to rdkkbiyugcjyrnkvobrr on 2026-08-07 (version
-- 20260807233141) but its file was never committed, so a fresh database
-- lacked the table the Customers panel and /request-access page use.
-- Column, constraint, policy, grant and function definitions below are the
-- ones read back from production, unchanged.

create table if not exists public.access_requests (
  id            uuid primary key default gen_random_uuid(),
  full_name     text not null,
  business_name text,
  email         text not null,
  phone         text,
  tier_interest text,
  note          text,
  status        text not null default 'pending'
                constraint access_requests_status_check check (status in ('pending', 'invited', 'dismissed')),
  created_at    timestamptz not null default now(),
  reviewed_at   timestamptz,
  reviewed_by   uuid references public.profiles(id)
);

alter table public.access_requests enable row level security;

drop policy if exists "access_requests staff read" on public.access_requests;
create policy "access_requests staff read" on public.access_requests
  for select to authenticated
  using ( public.is_admin_or_staff() );

drop policy if exists "access_requests staff update" on public.access_requests;
create policy "access_requests staff update" on public.access_requests
  for update to authenticated
  using ( public.is_admin_or_staff() )
  with check ( public.is_admin_or_staff() );

-- Public visitors submit through the SECURITY DEFINER RPC below only; there
-- is no anon policy, so the default table grants never expose rows.
create or replace function public.submit_access_request(
  p_full_name     text,
  p_email         text,
  p_business_name text default null,
  p_phone         text default null,
  p_tier_interest text default null,
  p_note          text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_full_name is null or btrim(p_full_name) = '' then
    raise exception 'name_required' using errcode = 'P0001';
  end if;
  if p_email is null or lower(btrim(p_email)) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'bad_email' using errcode = 'P0001';
  end if;
  insert into public.access_requests (full_name, email, business_name, phone, tier_interest, note)
  values (btrim(p_full_name), lower(btrim(p_email)), nullif(btrim(p_business_name), ''),
          nullif(btrim(p_phone), ''), nullif(btrim(p_tier_interest), ''), nullif(btrim(p_note), ''));
end $$;

grant execute on function public.submit_access_request(text, text, text, text, text, text) to anon, authenticated;

create or replace function public.set_access_request_status(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin_or_staff() then
    raise exception 'staff_only' using errcode = '42501';
  end if;
  if p_status not in ('pending','invited','dismissed') then
    raise exception 'bad_status' using errcode = 'P0001';
  end if;
  update public.access_requests
     set status = p_status, reviewed_at = now(), reviewed_by = auth.uid()
   where id = p_id;
end $$;

revoke execute on function public.set_access_request_status(uuid, text) from public, anon;
grant  execute on function public.set_access_request_status(uuid, text) to authenticated;
