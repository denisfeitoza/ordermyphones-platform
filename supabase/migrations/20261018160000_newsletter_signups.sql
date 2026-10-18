-- Footer "Notify me" form goes real (it was a mock that stored nothing).
--
-- A. newsletter_signups: visitors write ONLY through the SECURITY DEFINER RPC
--    below (no direct insert grant); staff read. One row per e-mail, stored
--    lowercased/trimmed so the unique constraint is meaningful.
-- B. subscribe_newsletter(): validates the e-mail, is idempotent (a repeat
--    signup is a silent no-op, and a re-signup after unsubscribing clears
--    unsubscribed_at), and returns the same result either way so the RPC never
--    reveals whether an address is already on the list. Rate limit is global
--    (50 new signups per 10 minutes): with one row per e-mail a per-e-mail cap
--    could never fire.

------------------------------------------------------------------
-- A. table
------------------------------------------------------------------
create table if not exists public.newsletter_signups (
  id              uuid primary key default gen_random_uuid(),
  email           text not null unique
                    check (length(email) between 3 and 254)
                    check (email = lower(btrim(email))),
  subscriber_id   uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  unsubscribed_at timestamptz
);

create index if not exists newsletter_signups_created_idx on public.newsletter_signups (created_at desc);

comment on table public.newsletter_signups is
  'Footer newsletter signups. Written only via subscribe_newsletter(); staff read.';

alter table public.newsletter_signups enable row level security;

create policy "newsletter_signups staff read" on public.newsletter_signups
  for select to authenticated using ( (select public.is_admin_or_staff()) );

revoke all on public.newsletter_signups from anon, authenticated;
grant select on public.newsletter_signups to authenticated;

------------------------------------------------------------------
-- B. subscribe RPC
------------------------------------------------------------------
create or replace function public.subscribe_newsletter(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_recent int;
begin
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(v_email) > 254 then
    raise exception 'bad_email' using errcode = 'P0001';
  end if;

  select count(*) into v_recent
    from public.newsletter_signups
   where created_at > now() - interval '10 minutes';
  if v_recent >= 50 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  insert into public.newsletter_signups (email, subscriber_id)
  values (v_email, auth.uid())
  on conflict (email) do update
    set unsubscribed_at = null
    where public.newsletter_signups.unsubscribed_at is not null;
end;
$$;

revoke all on function public.subscribe_newsletter(text) from public;
grant execute on function public.subscribe_newsletter(text) to anon, authenticated;
