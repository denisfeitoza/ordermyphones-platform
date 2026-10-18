-- Contact page goes real (it was a mock form that stored nothing).
--
-- A. contact_messages: anonymous visitors and customers write ONLY through the
--    SECURITY DEFINER RPC below (no direct insert grant); staff read and mark
--    handled. Length checks on every free-text column.
-- B. submit_contact_message(): validates email/topic/length and rate-limits to
--    5 messages per email per hour.
-- C. submit_access_request() gains the same length limits (it had none, and it
--    is anon-callable).

------------------------------------------------------------------
-- A. table
------------------------------------------------------------------
create table if not exists public.contact_messages (
  id            uuid primary key default gen_random_uuid(),
  email         text not null check (length(email) between 3 and 254),
  business_name text check (business_name is null or length(business_name) <= 200),
  topic         text not null check (topic in ('tier_pricing', 'reseller', 'bulk_quote', 'order_support', 'other')),
  message       text not null check (length(message) between 1 and 4000),
  status        text not null default 'new' check (status in ('new', 'handled')),
  sender_id     uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  handled_at    timestamptz,
  handled_by    uuid references auth.users(id) on delete set null
);

create index if not exists contact_messages_status_created_idx on public.contact_messages (status, created_at desc);
create index if not exists contact_messages_email_created_idx on public.contact_messages (email, created_at desc);

comment on table public.contact_messages is
  'Contact-page messages. Written only via submit_contact_message(); staff read and mark handled.';

alter table public.contact_messages enable row level security;

create policy "contact_messages staff read" on public.contact_messages
  for select to authenticated using ( (select public.is_admin_or_staff()) );
create policy "contact_messages staff update" on public.contact_messages
  for update to authenticated
  using ( (select public.is_admin_or_staff()) ) with check ( (select public.is_admin_or_staff()) );

revoke all on public.contact_messages from anon, authenticated;
grant select, update (status, handled_at, handled_by) on public.contact_messages to authenticated;

------------------------------------------------------------------
-- B. submit RPC
------------------------------------------------------------------
create or replace function public.submit_contact_message(
  p_email text,
  p_topic text,
  p_message text,
  p_business_name text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_msg   text := btrim(coalesce(p_message, ''));
  v_biz   text := nullif(btrim(coalesce(p_business_name, '')), '');
  v_recent int;
begin
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(v_email) > 254 then
    raise exception 'bad_email' using errcode = 'P0001';
  end if;
  if p_topic is null or p_topic not in ('tier_pricing', 'reseller', 'bulk_quote', 'order_support', 'other') then
    raise exception 'bad_topic' using errcode = 'P0001';
  end if;
  if v_msg = '' then
    raise exception 'message_required' using errcode = 'P0001';
  end if;
  if length(v_msg) > 4000 or length(coalesce(v_biz, '')) > 200 then
    raise exception 'too_long' using errcode = 'P0001';
  end if;

  select count(*) into v_recent
    from public.contact_messages
   where email = v_email and created_at > now() - interval '1 hour';
  if v_recent >= 5 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  insert into public.contact_messages (email, business_name, topic, message, sender_id)
  values (v_email, v_biz, p_topic, v_msg, auth.uid());
end;
$$;

revoke all on function public.submit_contact_message(text, text, text, text) from public;
grant execute on function public.submit_contact_message(text, text, text, text) to anon, authenticated;

------------------------------------------------------------------
-- C. access requests: length limits
------------------------------------------------------------------
alter table public.access_requests
  add constraint access_requests_lengths check (
    length(full_name) <= 200
    and length(email) <= 254
    and (business_name is null or length(business_name) <= 200)
    and (phone is null or length(phone) <= 40)
    and (tier_interest is null or length(tier_interest) <= 40)
    and (note is null or length(note) <= 4000)
  ) not valid;

alter table public.access_requests validate constraint access_requests_lengths;
