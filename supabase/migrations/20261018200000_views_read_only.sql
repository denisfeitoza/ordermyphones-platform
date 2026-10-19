-- SECURITY (critical, audit 2026-10-18): views were writable by anon.
--
-- Several public views are simple enough to be auto-updatable and run with
-- the owner's rights (not security_invoker). Supabase's default grants gave
-- anon/authenticated INSERT/UPDATE/DELETE on them, so anyone holding the
-- public anon key could write THROUGH them, bypassing RLS:
--   inventory_public (stock qty), products_public, suppliers_public,
--   stock_locations_public, product_variants_public, variant_price_for_me
-- (verified in a rolled-back transaction: anon updated 2,677 inventory rows).
--
-- Fix: every view in public is read-only for anon/authenticated, now and for
-- views created later. The unused *_public views also lose anon SELECT (the
-- web app reads none of them; product_variants_public listed unpublished
-- variant ids to anyone).

do $$
declare v record;
begin
  for v in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('v', 'm') loop
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from anon, authenticated, public', v.relname);
  end loop;
end $$;

revoke select on public.suppliers_public, public.stock_locations_public, public.products_public,
                 public.product_variants_public, public.inventory_public from anon;

-- Objects created from now on (by this migration role) start without anon/
-- authenticated write grants: tables that need client writes must grant them
-- explicitly next to their RLS policies (fail closed, as every recent
-- migration already does).
alter default privileges in schema public revoke insert, update, delete, truncate, references, trigger on tables from anon, authenticated;
