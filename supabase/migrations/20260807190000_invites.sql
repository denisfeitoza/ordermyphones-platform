-- 20260807190000_invites.sql
-- Phase 5 (Invites & Three-Gate Registration) — invite-only account creation.
--
-- Signup is DISABLED globally in Supabase Auth (locked decision 2: accounts are
-- invite-only, admin picks the tier). Because no transactional email sender /
-- service-role is wired in v1.0 (locked decision 4: zero external APIs), invites
-- are delivered as a COPYABLE LINK: the admin creates an invite, copies
-- `${origin}/auth/invite?token=...`, and hands it over. Email delivery is a
-- config toggle (app_settings.invite_email_delivery, seeded 'false' below) that
-- a later phase flips once a sender exists — nothing here blocks on email.
--
-- The three RPCs below are the only surface anon/authenticated touch; the
-- invites base table has NO anon/customer policy (admin/staff RLS only), so a
-- customer can never enumerate invites, tokens, or e-mails. get_invite exposes
-- exactly four fields (email/tier/status/expired) for the accept page.
--
-- Policy call convention (matches every prior migration in this project):
--   using ( (select public.is_admin_or_staff()) ), always `to authenticated`
--   so `anon` short-circuits.
--
-- AUTHORED ONLY — the orchestrator applies this via the Supabase MCP, not this
-- agent.

------------------------------------------------------------------
-- A. public.invites
--
-- token default: `extensions.gen_random_bytes` is SCHEMA-QUALIFIED on purpose.
-- pgcrypto lives in the `extensions` schema on Supabase, and a column DEFAULT
-- is evaluated under the INSERTING session's search_path. create_invite runs
-- `set search_path = ''` (project convention), so an unqualified
-- `gen_random_bytes(...)` would fail at insert time. gen_random_uuid() is fine
-- unqualified (it is in pg_catalog).
------------------------------------------------------------------
create table public.invites (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  tier        public.customer_tier not null,
  token       text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  status      text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  invited_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz
);

create index invites_status_idx on public.invites (status);
create index invites_email_idx  on public.invites (lower(email));

-- No set_updated_at trigger: invites has no updated_at column. State changes
-- (pending -> accepted/revoked) are done by the RPCs below and set explicit
-- timestamp columns (accepted_at); there is no generic mutation-audit column.

------------------------------------------------------------------
-- B. RLS — admin/staff full control; NO anon/customer policy on the base
-- table. All customer-facing access goes through the SECURITY DEFINER RPCs in
-- sections D/E, which expose a deliberately narrow projection.
------------------------------------------------------------------
alter table public.invites enable row level security;

create policy "invites admin all" on public.invites
  for all to authenticated
  using ( (select public.is_admin_or_staff()) )
  with check ( (select public.is_admin_or_staff()) );

-- No grant to anon: this project gives anon no default table privilege (see the
-- app_settings comment in 20260807180000), so anon cannot even attempt a read
-- of this table — belt-and-suspenders with the absent policy.

------------------------------------------------------------------
-- C. app_settings seed — the email-delivery toggle. OFF in v1.0: the admin
-- copies the invite link by hand. A later phase flips this to true once a
-- transactional sender exists. Stored as a jsonb boolean to match app_settings'
-- jsonb value contract.
------------------------------------------------------------------
insert into public.app_settings (key, value) values
  ('invite_email_delivery', 'false'::jsonb)
on conflict (key) do nothing;

------------------------------------------------------------------
-- D. create_invite(p_email, p_tier) — admin/staff creates an invite and gets
-- the row back (the app builds the accept link from `token`).
--
-- SECURITY DEFINER but STILL gated: the definer bypasses RLS, so the
-- is_admin_or_staff() check inside is what actually enforces authorization.
-- E-mail is lower(trim(...))-normalized so it matches the account GoTrue
-- eventually creates (GoTrue lowercases on signInWithPassword).
------------------------------------------------------------------
create or replace function public.create_invite(p_email text, p_tier public.customer_tier)
returns public.invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email  text := lower(trim(p_email));
  v_invite public.invites;
begin
  if not (select public.is_admin_or_staff()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if v_email is null or v_email = '' or position('@' in v_email) = 0 then
    raise exception 'invalid_email' using errcode = '22023';
  end if;

  insert into public.invites (email, tier, invited_by)
  values (v_email, p_tier, auth.uid())
  returning * into v_invite;

  return v_invite;
end;
$$;

revoke execute on function public.create_invite(text, public.customer_tier) from public, anon, authenticated;
grant  execute on function public.create_invite(text, public.customer_tier) to authenticated;

------------------------------------------------------------------
-- E. get_invite(p_token) — anon-callable lookup for the accept page. Returns a
-- deliberately narrow projection (email/tier/status/expired) so the page can
-- greet the invited person and render the right tier form WITHOUT exposing the
-- invites table, the token list, or any other invite. Returns zero rows for an
-- unknown token (no oracle beyond "this exact token is/ isn't live"). `expired`
-- is COMPUTED (now() > expires_at) — it does not mutate status.
------------------------------------------------------------------
create or replace function public.get_invite(p_token text)
returns table(email text, tier public.customer_tier, status text, expired boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select i.email, i.tier, i.status, (now() > i.expires_at) as expired
  from public.invites i
  where i.token = p_token
$$;

revoke execute on function public.get_invite(text) from public;
grant  execute on function public.get_invite(text) to anon, authenticated;

------------------------------------------------------------------
-- F. redeem_invite(p_token, p_display_name, p_password) — anon-callable. This
-- is the account-creation path that replaces GoTrue signup (which is disabled).
--
-- Because we bypass GoTrue entirely, NOTHING else validates the password or
-- name — so this RPC is the server-side validation line (§3.5): it enforces a
-- non-empty display name and an 8+ char password and raises otherwise.
--
-- The password arrives over TLS and is bcrypt-hashed HERE via extensions.crypt
-- (the exact scheme GoTrue uses), so auth.users.encrypted_password holds only
-- the hash — the plaintext is never stored and never logged.
--
-- Concurrency: the token row is locked FOR UPDATE first, so two simultaneous
-- redeems of the same token can't both pass the 'pending' check and mint two
-- users. E-mail uniqueness is enforced explicitly (raise 'email_taken').
--
-- After inserting auth.users, the existing trg_handle_new_user trigger creates
-- the profile as role='customer'; this RPC then sets tier + display_name.
-- Running as SECURITY DEFINER (owner, not 'authenticated'), it is not blocked
-- by guard_profile_privileged_columns (which only fences the 'authenticated'
-- PostgREST role) — so it can legitimately set the admin-managed tier column.
--
-- confirmed_at is a GENERATED column (LEAST(email_confirmed_at,
-- phone_confirmed_at)) on Supabase — we insert email_confirmed_at only and let
-- confirmed_at derive. The empty-string token columns are set explicitly:
-- GoTrue's Go scanner errors on NULLs there even though the DB allows them.
------------------------------------------------------------------
create or replace function public.redeem_invite(
  p_token        text,
  p_display_name text,
  p_password     text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.invites;
  v_name   text := trim(coalesce(p_display_name, ''));
  v_uid    uuid := gen_random_uuid();
begin
  -- Lock the invite row so concurrent redeems serialize on it.
  select * into v_invite
  from public.invites
  where token = p_token
  for update;

  if not found then
    raise exception 'invalid_token' using errcode = '22023';
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'invite_not_pending' using errcode = '22023';
  end if;

  if now() > v_invite.expires_at then
    raise exception 'invite_expired' using errcode = '22023';
  end if;

  if v_name = '' then
    raise exception 'display_name_required' using errcode = '22023';
  end if;

  if p_password is null or length(p_password) < 8 then
    raise exception 'weak_password' using errcode = '22023';
  end if;

  -- Reject if an auth user already owns this e-mail (case-insensitive, matching
  -- GoTrue's own normalization).
  if exists (select 1 from auth.users u where lower(u.email) = v_invite.email) then
    raise exception 'email_taken' using errcode = '23505';
  end if;

  -- Create the auth user. GoTrue-compatible column set; empty-string tokens to
  -- keep GoTrue's scanner happy; email_confirmed_at set (invite = trusted
  -- e-mail, no confirmation mail in v1). confirmed_at is generated — omitted.
  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data,
    confirmation_token,
    recovery_token,
    email_change,
    email_change_token_new,
    email_change_token_current,
    phone_change,
    phone_change_token,
    reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_uid,
    'authenticated',
    'authenticated',
    v_invite.email,
    extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    '', '', '', '', '', '', '', ''
  );

  -- Matching identity row (email provider). provider_id = the e-mail;
  -- identity_data carries sub + email (what GoTrue expects).
  insert into auth.identities (
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) values (
    v_invite.email,
    v_uid,
    jsonb_build_object('sub', v_uid::text, 'email', v_invite.email),
    'email',
    now(),
    now(),
    now()
  );

  -- trg_handle_new_user already inserted the profile as role='customer'.
  -- Apply the invite's tier + the chosen display name.
  update public.profiles
  set tier = v_invite.tier,
      display_name = v_name
  where id = v_uid;

  -- Consume the invite.
  update public.invites
  set status = 'accepted',
      accepted_at = now()
  where id = v_invite.id;

  return jsonb_build_object('ok', true, 'email', v_invite.email);
end;
$$;

revoke execute on function public.redeem_invite(text, text, text) from public;
grant  execute on function public.redeem_invite(text, text, text) to anon, authenticated;

comment on function public.redeem_invite(text, text, text) is
  'Invite-only account creation (replaces disabled GoTrue signup). Validates a pending, non-expired token; enforces display name + 8-char password server-side; bcrypt-hashes the password via extensions.crypt (never stores/logs plaintext); creates auth.users + auth.identities; lets trg_handle_new_user seed the profile then sets tier+display_name from the invite; marks the invite accepted. SECURITY DEFINER, anon-callable. Concurrency-safe via FOR UPDATE on the invite row.';
