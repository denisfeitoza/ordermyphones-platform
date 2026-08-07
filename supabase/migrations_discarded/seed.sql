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

-- Real-world feeds behind the two API integrations contracted in §1.4.
-- The codes `source-1` and `source-2` are kept as contract-level abstractions
-- so the supplier itself can change without a schema migration; the human
-- name lives in `display_name` + `notes`.
insert into public.suppliers (code, display_name, country, kind, is_active, notes) values
  ('source-1', 'Assurant', 'US', 'dropship', true,
   'U.S.-based dropship / lifecycle services partner. Source: https://www.assurant.com. Sandbox + production credentials confirmed during the Phase 1 supplier audit.'),
  ('source-2', 'Mannapov LLC (+ reserved DXB wholesale slot)', 'US', 'dropship', true,
   'Primary feed: Mannapov LLC, U.S.-based wholesale/dropship portal — https://buy.mannapovllc.com. The adapter also carries a reserved feed slot for the Dubai wholesale supplier contemplated by Agreement §1.4 / Schedule A.2, to be named during the Phase 1 supplier audit.')
on conflict (code) do update
  set display_name = excluded.display_name,
      country = excluded.country,
      kind = excluded.kind,
      is_active = excluded.is_active,
      notes = excluded.notes;
