-- Onboarding (RFC-001: CX Reg, document slots, Master Agreement).
--  * business_profiles: the CX Reg data, one row per account (owner edits;
--    sub-accounts read). Field list is provisional until OMP sends CX Reg;
--    anything extra goes into `extra` (jsonb) without a migration.
--  * account_documents + private bucket account-documents: one slot per
--    document kind, staff review (pending/approved/rejected).
--  * agreement_versions (admin publishes; body immutable once published,
--    sha256 computed server-side) and agreement_signatures (typed signature:
--    name, title, version, content hash, IP, user agent, time — written only
--    by sign_agreement()).
--  * order_requirements_missing: 'master_agreement' (enforcement key
--    g3_master_agreement, blocks approval by default — any signed version
--    counts) and the tax certificate is also satisfied by a resale
--    certificate in the new document slots.

create table public.business_profiles (
  account_id             uuid primary key references public.profiles(id) on delete cascade,
  legal_name             text check (length(legal_name) <= 200),
  dba                    text check (length(dba) <= 200),
  entity_type            text check (length(entity_type) <= 60),
  ein                    text check (length(ein) <= 20),
  state_of_incorporation text check (length(state_of_incorporation) <= 60),
  year_established       integer check (year_established between 1800 and 2100),
  website                text check (length(website) <= 200),
  phone                  text check (length(phone) <= 40),
  business_address       jsonb check (business_address is null or length(business_address::text) <= 1000),
  billing_address        jsonb check (billing_address is null or length(billing_address::text) <= 1000),
  primary_contact        jsonb check (primary_contact is null or length(primary_contact::text) <= 1000),
  ap_contact             jsonb check (ap_contact is null or length(ap_contact::text) <= 1000),
  director               jsonb check (director is null or length(director::text) <= 1000),
  resale_cert_number     text check (length(resale_cert_number) <= 60),
  resale_cert_state      text check (length(resale_cert_state) <= 60),
  r2_cert_number         text check (length(r2_cert_number) <= 60),
  duns_number            text check (length(duns_number) <= 20),
  monthly_volume         text check (length(monthly_volume) <= 60),
  carrier_account        jsonb check (carrier_account is null or length(carrier_account::text) <= 300),
  trade_references       jsonb check (trade_references is null or length(trade_references::text) <= 4000),
  extra                  jsonb not null default '{}' check (length(extra::text) <= 8000),
  status                 text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'changes_requested')),
  submitted_at           timestamptz,
  reviewed_at            timestamptz,
  reviewed_by            uuid references public.profiles(id),
  review_note            text check (length(review_note) <= 1000),
  updated_at             timestamptz not null default now()
);
alter table public.business_profiles enable row level security;
create policy business_profiles_read on public.business_profiles for select to authenticated
  using (account_id = (select public.current_account_id()) or (select public.is_admin_or_staff()));
-- Only the account owner writes its own profile (sub-accounts read it).
create policy business_profiles_owner_insert on public.business_profiles for insert to authenticated
  with check (account_id = (select auth.uid()) and status in ('draft', 'submitted'));
create policy business_profiles_owner_update on public.business_profiles for update to authenticated
  using (account_id = (select auth.uid())) with check (account_id = (select auth.uid()));
grant select, insert, update on public.business_profiles to authenticated;
revoke all on public.business_profiles from anon;

-- The owner can't approve itself: any owner edit puts the profile back to
-- submitted/draft and clears the review; only review_business_profile()
-- (staff, definer) sets approved/changes_requested.
create or replace function public.business_profiles_guard()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if public.is_admin_or_staff() then
    return new;
  end if;
  -- An owner never sets a review outcome; any owner edit clears the review.
  if new.status not in ('draft', 'submitted') then
    new.status := 'submitted';
  end if;
  new.reviewed_at := null;
  new.reviewed_by := null;
  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status <> 'submitted') then
    new.submitted_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger trg_business_profiles_guard before insert or update on public.business_profiles
  for each row execute function public.business_profiles_guard();

create or replace function public.review_business_profile(p_account_id uuid, p_status text, p_note text default null)
returns public.business_profiles
language plpgsql
security definer
set search_path to ''
as $$
declare v_uid uuid := auth.uid(); v_row public.business_profiles;
begin
  if v_uid is null or not public.is_admin_or_staff() then raise exception 'staff_only' using errcode = '42501'; end if;
  if p_status not in ('approved', 'changes_requested') then raise exception 'bad_status' using errcode = 'P0001'; end if;
  update public.business_profiles
     set status = p_status, reviewed_at = now(), reviewed_by = v_uid, review_note = nullif(btrim(p_note), '')
   where account_id = p_account_id returning * into v_row;
  if not found then raise exception 'profile_not_found' using errcode = 'P0001'; end if;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, payload)
  values (v_uid, 'business_profile_reviewed', 'profiles', p_account_id, jsonb_build_object('status', p_status, 'note', v_row.review_note));
  return v_row;
end;
$$;

-- Document slots.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('account-documents', 'account-documents', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "account-documents owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'account-documents' and (storage.foldername(name))[1] = (select auth.uid())::text
              and (select auth.uid()) = (select public.current_account_id()));
create policy "account-documents read" on storage.objects for select to authenticated
  using (bucket_id = 'account-documents'
         and ((storage.foldername(name))[1] = (select public.current_account_id())::text or (select public.is_admin_or_staff())));
create policy "account-documents staff delete" on storage.objects for delete to authenticated
  using (bucket_id = 'account-documents' and (select public.is_admin_or_staff()));

create table public.account_documents (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('w9', 'resale_cert', 'r2_cert', 'dnb_report', 'articles', 'owner_id', 'other')),
  file_path   text not null check (length(file_path) <= 500),
  file_name   text check (length(file_name) <= 200),
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  uploaded_by uuid references public.profiles(id),
  uploaded_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_note text check (length(review_note) <= 1000)
);
create index account_documents_account_kind on public.account_documents (account_id, kind, uploaded_at desc);
alter table public.account_documents enable row level security;
create policy account_documents_read on public.account_documents for select to authenticated
  using (account_id = (select public.current_account_id()) or (select public.is_admin_or_staff()));
-- The owner adds a pending document in its own folder; review is staff-only (RPC).
create policy account_documents_owner_insert on public.account_documents for insert to authenticated
  with check (account_id = (select auth.uid()) and status = 'pending' and reviewed_by is null
              and file_path like (select auth.uid())::text || '/%');
grant select, insert on public.account_documents to authenticated;
revoke all on public.account_documents from anon;

create or replace function public.review_document(p_document_id uuid, p_status text, p_note text default null)
returns public.account_documents
language plpgsql
security definer
set search_path to ''
as $$
declare v_uid uuid := auth.uid(); v_row public.account_documents;
begin
  if v_uid is null or not public.is_admin_or_staff() then raise exception 'staff_only' using errcode = '42501'; end if;
  if p_status not in ('approved', 'rejected', 'pending') then raise exception 'bad_status' using errcode = 'P0001'; end if;
  update public.account_documents
     set status = p_status, reviewed_by = v_uid, reviewed_at = now(), review_note = nullif(btrim(p_note), '')
   where id = p_document_id returning * into v_row;
  if not found then raise exception 'document_not_found' using errcode = 'P0001'; end if;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, payload)
  values (v_uid, 'document_reviewed', 'profiles', v_row.account_id, jsonb_build_object('document_id', p_document_id, 'kind', v_row.kind, 'status', p_status));
  return v_row;
end;
$$;

-- Master Agreement.
create table public.agreement_versions (
  id           uuid primary key default gen_random_uuid(),
  version      text not null unique check (length(version) between 1 and 40),
  title        text not null check (length(title) between 1 and 200),
  body         text not null check (length(body) between 1 and 200000),
  sha256       text not null,
  is_active    boolean not null default false,
  published_at timestamptz,
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now()
);
create unique index agreement_versions_one_active on public.agreement_versions (is_active) where is_active;

create or replace function public.agreement_versions_guard()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if tg_op = 'UPDATE' and old.published_at is not null
     and (new.body is distinct from old.body or new.version is distinct from old.version or new.title is distinct from old.title) then
    raise exception 'agreement_published_is_immutable' using errcode = 'P0001';
  end if;
  new.sha256 := encode(sha256(convert_to(new.body, 'UTF8')), 'hex');
  if new.is_active and new.published_at is null then new.published_at := now(); end if;
  return new;
end;
$$;
create trigger trg_agreement_versions_guard before insert or update on public.agreement_versions
  for each row execute function public.agreement_versions_guard();
create trigger trg_agreement_versions_no_delete before delete on public.agreement_versions
  for each row when (old.published_at is not null) execute function public.deny_ledger_mutation();

alter table public.agreement_versions enable row level security;
create policy agreement_versions_read on public.agreement_versions for select to authenticated
  using (published_at is not null or (select public.is_admin()));
create policy agreement_versions_admin_insert on public.agreement_versions for insert to authenticated
  with check ((select public.is_admin()));
create policy agreement_versions_admin_update on public.agreement_versions for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
grant select, insert, update on public.agreement_versions to authenticated;
revoke all on public.agreement_versions from anon;

-- Make one version the active one (and publish it). Admin only.
create or replace function public.activate_agreement_version(p_version_id uuid)
returns public.agreement_versions
language plpgsql
security definer
set search_path to ''
as $$
declare v_row public.agreement_versions;
begin
  if not public.is_admin() then raise exception 'admin_only' using errcode = '42501'; end if;
  update public.agreement_versions set is_active = false where is_active and id <> p_version_id;
  update public.agreement_versions set is_active = true where id = p_version_id returning * into v_row;
  if not found then raise exception 'agreement_not_found' using errcode = 'P0001'; end if;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, payload)
  values (auth.uid(), 'agreement_activated', 'agreement_versions', p_version_id, jsonb_build_object('version', v_row.version, 'sha256', v_row.sha256));
  return v_row;
end;
$$;

create table public.agreement_signatures (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid not null references public.profiles(id) on delete cascade,
  version_id     uuid not null references public.agreement_versions(id),
  signer_id      uuid not null references public.profiles(id),
  signer_name    text not null check (length(signer_name) between 2 and 120),
  signer_title   text not null check (length(signer_title) between 2 and 120),
  content_sha256 text not null,
  ip             text,
  user_agent     text,
  signed_at      timestamptz not null default now(),
  unique (account_id, version_id)
);
alter table public.agreement_signatures enable row level security;
create policy agreement_signatures_read on public.agreement_signatures for select to authenticated
  using (account_id = (select public.current_account_id()) or (select public.is_admin_or_staff()));
grant select on public.agreement_signatures to authenticated;
revoke all on public.agreement_signatures from anon;
create trigger trg_agreement_signatures_append_only before update or delete on public.agreement_signatures
  for each row execute function public.deny_ledger_mutation();

-- Typed signature by the account owner, on the active version.
create or replace function public.sign_agreement(p_version_id uuid, p_name text, p_title text)
returns public.agreement_signatures
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_ver  public.agreement_versions;
  v_row  public.agreement_signatures;
  v_ua   text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if v_uid <> public.current_account_id() then raise exception 'owner_only' using errcode = '42501'; end if;
  select * into v_ver from public.agreement_versions where id = p_version_id and is_active and published_at is not null;
  if not found then raise exception 'agreement_not_active' using errcode = 'P0001'; end if;
  if length(btrim(coalesce(p_name, ''))) < 2 or length(btrim(coalesce(p_title, ''))) < 2
     or length(p_name) > 120 or length(p_title) > 120 then
    raise exception 'bad_signature' using errcode = 'P0001';
  end if;
  begin
    v_ua := left(current_setting('request.headers', true)::jsonb->>'user-agent', 400);
  exception when others then
    v_ua := null;
  end;
  insert into public.agreement_signatures (account_id, version_id, signer_id, signer_name, signer_title, content_sha256, ip, user_agent)
  values (v_uid, v_ver.id, v_uid, btrim(p_name), btrim(p_title), v_ver.sha256, public.request_ip(), v_ua)
  on conflict (account_id, version_id) do nothing
  returning * into v_row;
  if v_row.id is null then
    select * into v_row from public.agreement_signatures where account_id = v_uid and version_id = v_ver.id;
  else
    insert into public.audit_log (actor_id, action, entity_type, entity_id, payload)
    values (v_uid, 'agreement_signed', 'profiles', v_uid, jsonb_build_object('version', v_ver.version, 'sha256', v_ver.sha256, 'ip', v_row.ip));
  end if;
  return v_row;
end;
$$;

revoke all on function public.review_business_profile(uuid, text, text) from public, anon;
revoke all on function public.review_document(uuid, text, text) from public, anon;
revoke all on function public.activate_agreement_version(uuid) from public, anon;
revoke all on function public.sign_agreement(uuid, text, text) from public, anon;
grant execute on function public.review_business_profile(uuid, text, text) to authenticated;
grant execute on function public.review_document(uuid, text, text) to authenticated;
grant execute on function public.activate_agreement_version(uuid) to authenticated;
grant execute on function public.sign_agreement(uuid, text, text) to authenticated;

-- Enforcement: signed agreement blocks approval by default.
update public.app_settings
   set value = value || jsonb_build_object('g3_master_agreement', jsonb_build_object('approval', true, 'checkout', false))
 where key = 'enforcement_points' and not (value ? 'g3_master_agreement');

create or replace function public.order_requirements_missing(p_customer uuid, p_stage text, p_shipping jsonb)
returns text[]
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_cfg   jsonb;
  v_acct  uuid;
  v_tier  text;
  v_name  text;
  v_out   text[] := '{}';
begin
  select value into v_cfg from public.app_settings where key = 'enforcement_points';
  v_cfg := coalesce(v_cfg, '{}'::jsonb);

  select coalesce(p.parent_account_id, p.id) into v_acct from public.profiles p where p.id = p_customer;
  select o.tier::text, o.display_name into v_tier, v_name from public.profiles o where o.id = v_acct;

  if coalesce((v_cfg->'g1_business_name'->>p_stage)::boolean, false)
     and coalesce(btrim(v_name), '') = ''
     and not exists (select 1 from public.business_profiles bp where bp.account_id = v_acct and coalesce(btrim(bp.legal_name), '') <> '') then
    v_out := array_append(v_out, 'business_name');
  end if;

  if coalesce((v_cfg->'shipping_address'->>p_stage)::boolean, false)
     and (coalesce(btrim(p_shipping->>'street'), '') = '' or coalesce(btrim(p_shipping->>'city'), '') = ''
          or coalesce(btrim(p_shipping->>'state'), '') = '' or coalesce(btrim(p_shipping->>'zip'), '') = '') then
    v_out := array_append(v_out, 'shipping_address');
  end if;

  if coalesce((v_cfg->'g2_tax_certificate'->>p_stage)::boolean, false)
     and v_tier in ('retailer', 'wholesale', 'distributor')
     and not exists (
       select 1 from storage.objects so
        where so.bucket_id = 'tax-certificates' and so.name like v_acct::text || '/%'
     )
     and not exists (
       select 1 from public.account_documents d
        where d.account_id = v_acct and d.kind = 'resale_cert' and d.status <> 'rejected'
     ) then
    v_out := array_append(v_out, 'tax_certificate');
  end if;

  -- Only once an agreement is published: until then there is nothing to sign.
  if coalesce((v_cfg->'g3_master_agreement'->>p_stage)::boolean, false)
     and v_tier in ('retailer', 'wholesale', 'distributor')
     and exists (select 1 from public.agreement_versions av where av.is_active)
     and not exists (select 1 from public.agreement_signatures s where s.account_id = v_acct) then
    v_out := array_append(v_out, 'master_agreement');
  end if;

  return v_out;
end;
$$;
