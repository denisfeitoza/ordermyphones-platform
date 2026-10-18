-- Manual screenshots show unit cost and tier prices, so they cannot live in
-- the web app's public/ folder (served to anyone). Private bucket: only
-- admin/staff can read; the manual page fetches short-lived signed URLs.
insert into storage.buckets (id, name, public)
values ('manual-shots', 'manual-shots', false)
on conflict (id) do update set public = false;

drop policy if exists "manual-shots staff read" on storage.objects;
create policy "manual-shots staff read" on storage.objects
  for select to authenticated
  using ( bucket_id = 'manual-shots' and (select public.is_admin_or_staff()) );
-- No insert/update/delete policy: uploads go through the service role only.
