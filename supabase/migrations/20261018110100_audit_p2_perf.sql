-- Audit 2026-09-13 P2 perf leftovers.
-- A. app_settings: split the FOR ALL admin write policy (it overlapped the
--    public SELECT policy). Same predicate, same access.
-- B. Index the two foreign keys read on hot admin paths (flag queue by
--    variant, reconciliation by location). Audit-only "*_by"/"actor_id"
--    columns stay unindexed on purpose: nothing filters or joins on them.

drop policy if exists "app_settings admin write" on public.app_settings;
create policy "app_settings admin insert" on public.app_settings
  for insert to authenticated with check ( (select public.is_admin()) );
create policy "app_settings admin update" on public.app_settings
  for update to authenticated using ( (select public.is_admin()) ) with check ( (select public.is_admin()) );
create policy "app_settings admin delete" on public.app_settings
  for delete to authenticated using ( (select public.is_admin()) );

create index if not exists pricing_flags_variant_id_idx on public.pricing_flags (variant_id);
create index if not exists reconciliation_queue_location_id_idx on public.reconciliation_queue (location_id);
