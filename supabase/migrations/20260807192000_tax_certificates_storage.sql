-- 20260807192000_tax_certificates_storage.sql
-- Phase 5 (Three-Gate Registration) — G2 storage for B2B tax certificates.
--
-- Gate G2 (REGISTRATION-FIELDS.md): business tiers upload a Sales Tax
-- Certificate before their first order is APPROVED (soft gate — admin can
-- override). This migration creates the PRIVATE bucket + the storage.objects
-- RLS that scopes each file to its uploader.
--
-- PATH CONVENTION: `${auth.uid()}/<filename>` — e.g. `<uid>/cert.pdf`. The
-- first path segment is the owner's uid, which is exactly what the policies
-- below check via storage.foldername(name)[1]. Re-upload = overwrite/insert a
-- new object under the same prefix (UPDATE + INSERT both allowed for the owner).
--
-- No public read: the bucket is private and there is NO `to anon` /
-- `to public` select policy, so a certificate is readable only by its owner and
-- by admin/staff.
--
-- APPLY-TIME NOTE for the orchestrator: creating policies on storage.objects
-- requires ownership of that table. The MCP applies as the postgres role, which
-- normally owns it on Supabase — but this is the one step that can fail with a
-- "must be owner of table objects" error if the project's storage schema is
-- owned differently. If so, run these `create policy` statements from the
-- Supabase dashboard (Storage > Policies) instead; the bucket insert itself
-- always works.
--
-- AUTHORED ONLY — applied by the orchestrator via MCP.

------------------------------------------------------------------
-- A. Private bucket
------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('tax-certificates', 'tax-certificates', false)
on conflict (id) do nothing;

------------------------------------------------------------------
-- B. RLS policies on storage.objects, scoped to bucket_id.
-- storage.objects already has RLS enabled by Supabase; we only add policies.
-- (storage.foldername(name))[1] is the first path segment = the owner uid.
------------------------------------------------------------------

-- Owner can upload their own certificate (path must start with their uid).
create policy "tax-certs owner insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'tax-certificates'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Owner can read their own certificate.
create policy "tax-certs owner select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'tax-certificates'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Owner can re-upload (overwrite) their own certificate.
create policy "tax-certs owner update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'tax-certificates'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'tax-certificates'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Admin/staff can read every certificate (approval-queue preview, Phase 6).
create policy "tax-certs staff select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'tax-certificates'
    and (select public.is_admin_or_staff())
  );
