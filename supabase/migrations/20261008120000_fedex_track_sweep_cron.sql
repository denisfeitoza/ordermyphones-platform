-- 20261008120000_fedex_track_sweep_cron.sql
-- Schedules the fedex-track sweep (SHIPMENT-TRACKING.md §7 "30-minute sweep",
-- left as a follow-up in 20260917120000_shipping_fedex.sql).
--
-- The bearer token is read from Vault at run time (secret name
-- 'fedex_track_sweep_secret', same value as the FEDEX_TRACK_SWEEP_SECRET edge
-- secret). It is created out-of-band, never in a migration file. Without that
-- Vault secret the job sends no request at all.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  perform cron.unschedule('fedex-track-sweep')
  where exists (select 1 from cron.job where jobname = 'fedex-track-sweep');
end $$;

select cron.schedule(
  'fedex-track-sweep',
  '*/30 * * * *',
  $job$
  select net.http_post(
    url     := 'https://rdkkbiyugcjyrnkvobrr.supabase.co/functions/v1/fedex-track',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || s.decrypted_secret
    ),
    body    := '{"sweep":true}'::jsonb
  )
  from vault.decrypted_secrets s
  where s.name = 'fedex_track_sweep_secret';
  $job$
);
