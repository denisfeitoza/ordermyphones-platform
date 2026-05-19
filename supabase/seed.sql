-- supabase/seed.sql
-- Tier definitions + supplier rows. Safe to re-run.

insert into public.tiers (code, label, min_units, max_units, position) values
  ('tier_1', 'Consumer',    1,    10,   1),
  ('tier_2', 'Retailer',    10,   50,   2),
  ('tier_3', 'Multi-Store', 50,   400,  3),
  ('tier_4', 'Wholesale',   401,  null, 4)
on conflict (code) do update
  set label = excluded.label,
      min_units = excluded.min_units,
      max_units = excluded.max_units,
      position = excluded.position;

insert into public.suppliers (code, display_name, country, kind, is_active, notes) values
  ('source-1', 'Source #1 — US Dropship A', 'US', 'dropship', true,
   'First U.S.-based dropship integration (placeholder name — replace after Phase 1 audit).'),
  ('source-2', 'Source #2 — US Dropship B + Dubai Wholesale (consolidated)', 'US', 'dropship', true,
   'Two feeds: source-2-us (US dropship) + source-2-dxb (Dubai wholesale). Routing decided by services/supplier-source-2.')
on conflict (code) do update
  set display_name = excluded.display_name,
      country = excluded.country,
      kind = excluded.kind,
      is_active = excluded.is_active,
      notes = excluded.notes;
