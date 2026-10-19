-- Transactional e-mail outbox (ready for SMTP; nothing is sent from here).
-- Triggers queue one row per business event; a sender (Edge Function + the
-- SMTP provider, still to connect) renders the template and sends it.
--  * dedupe_key is unique: the same event never queues twice.
--  * to_staff = true means "every admin/staff address", resolved at send time.
--  * The triggers only insert (on conflict do nothing) — they never raise,
--    so an e-mail problem can never fail an order, approval or invite.
--  * Staff can read the outbox; nobody writes it through the API.

create table public.email_outbox (
  id          uuid primary key default gen_random_uuid(),
  dedupe_key  text not null unique,
  template    text not null,
  to_email    text,
  to_staff    boolean not null default false,
  locale      text not null default 'en',
  payload     jsonb not null default '{}',
  status      text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped')),
  attempts    integer not null default 0,
  last_error  text,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  check (to_staff or to_email is not null)
);
create index email_outbox_status_created on public.email_outbox (status, created_at);
alter table public.email_outbox enable row level security;
create policy email_outbox_staff_read on public.email_outbox for select to authenticated
  using ((select public.is_admin_or_staff()));
grant select on public.email_outbox to authenticated;
revoke all on public.email_outbox from anon;

create or replace function public.queue_email(p_key text, p_template text, p_to text, p_to_staff boolean, p_locale text, p_payload jsonb)
returns void
language sql
security definer
set search_path to ''
as $$
  insert into public.email_outbox (dedupe_key, template, to_email, to_staff, locale, payload)
  select p_key, p_template, nullif(btrim(p_to), ''), coalesce(p_to_staff, false), coalesce(nullif(p_locale, ''), 'en'), coalesce(p_payload, '{}')
   where p_to_staff or nullif(btrim(p_to), '') is not null
  on conflict (dedupe_key) do nothing
$$;
revoke all on function public.queue_email(text, text, text, boolean, text, jsonb) from public, anon, authenticated;

-- Orders: placed, decided, cancelled, shipped, paid, label requested/received.
create or replace function public.orders_email_events()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_email  text;
  v_locale text;
  v_ref    text := 'SO-' || upper(left(new.id::text, 8));
  v_p      jsonb;
begin
  select p.email, p.locale into v_email, v_locale from public.profiles p where p.id = new.customer_id;
  v_p := jsonb_build_object('order_id', new.id, 'ref', v_ref, 'status', new.status, 'is_test', new.is_test,
                            'subtotal_cents', new.subtotal_cents, 'shipping_cents', new.shipping_cents,
                            'payment_terms', new.payment_terms, 'due_at', new.due_at, 'customer_email', v_email);

  if tg_op = 'INSERT' then
    perform public.queue_email('order_placed:' || new.id, 'order_placed_staff', null, true, 'en', v_p);
    perform public.queue_email('order_received:' || new.id, 'order_received', v_email, false, v_locale, v_p);
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status in ('approved', 'partially_approved') then
      perform public.queue_email('order_approved:' || new.id, 'order_approved', v_email, false, v_locale, v_p);
    elsif new.status = 'rejected' then
      perform public.queue_email('order_rejected:' || new.id, 'order_rejected', v_email, false, v_locale,
                                 v_p || jsonb_build_object('reason', new.decision_reason));
    elsif new.status = 'cancelled' then
      perform public.queue_email('order_cancelled:' || new.id, 'order_cancelled', v_email, false, v_locale,
                                 v_p || jsonb_build_object('reason', new.decision_reason));
    elsif new.status = 'shipped' then
      perform public.queue_email('order_shipped:' || new.id, 'order_shipped', v_email, false, v_locale,
                                 v_p || jsonb_build_object('carrier', new.tracking_carrier, 'tracking', new.tracking_number));
    end if;
  end if;

  if new.payment_status = 'paid' and old.payment_status is distinct from 'paid' then
    perform public.queue_email('order_paid:' || new.id || ':' || coalesce(new.paid_at::text, ''), 'payment_received', v_email, false, v_locale, v_p);
  end if;

  if new.shipping_stage is distinct from old.shipping_stage then
    if new.shipping_stage = 'awaiting_label' then
      perform public.queue_email('label_requested:' || new.id, 'label_requested', v_email, false, v_locale,
                                 v_p || jsonb_build_object('package', new.package));
    elsif new.shipping_stage = 'label_received' then
      perform public.queue_email('label_received:' || new.id, 'label_received_staff', null, true, 'en', v_p);
    end if;
  end if;
  return new;
end;
$$;
create trigger trg_orders_email_events after insert or update on public.orders
  for each row execute function public.orders_email_events();

-- Invites (the e-mail invite the RFC asks for), access requests, registration review.
create or replace function public.invites_email_event()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  perform public.queue_email('invite:' || new.id, 'invite', new.email, false, 'en',
                             jsonb_build_object('token', new.token, 'tier', new.tier, 'expires_at', new.expires_at));
  return new;
end;
$$;
create trigger trg_invites_email_event after insert on public.invites
  for each row execute function public.invites_email_event();

create or replace function public.access_requests_email_event()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  perform public.queue_email('access_request:' || new.id, 'access_request_staff', null, true, 'en',
                             jsonb_build_object('name', new.full_name, 'business', new.business_name, 'email', new.email, 'tier_interest', new.tier_interest));
  return new;
end;
$$;
create trigger trg_access_requests_email_event after insert on public.access_requests
  for each row execute function public.access_requests_email_event();

create or replace function public.business_profiles_email_event()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare v_email text; v_locale text;
begin
  select email, locale into v_email, v_locale from public.profiles where id = new.account_id;
  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status is distinct from 'submitted') then
    perform public.queue_email('registration_submitted:' || new.account_id || ':' || coalesce(new.submitted_at::text, ''), 'registration_submitted_staff', null, true, 'en',
                               jsonb_build_object('account_id', new.account_id, 'legal_name', new.legal_name, 'email', v_email));
  elsif new.status in ('approved', 'changes_requested') and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform public.queue_email('registration_' || new.status || ':' || new.account_id || ':' || coalesce(new.reviewed_at::text, ''),
                               'registration_' || new.status, v_email, false, v_locale,
                               jsonb_build_object('note', new.review_note, 'legal_name', new.legal_name));
  end if;
  return new;
end;
$$;
create trigger trg_business_profiles_email_event after insert or update on public.business_profiles
  for each row execute function public.business_profiles_email_event();
