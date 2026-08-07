------------------------------------------------------------------
-- Enrich public.import_synonyms (kind='header') with common cross-supplier
-- header aliases so a NEW supplier's sheet auto-maps on first sight instead of
-- falling to fuzzy/content/manual. Each supplier names its columns differently
-- ("Device"/"Model Name"/"Product" all mean model; "Storage"/"Memory" mean
-- capacity; "Depot"/"DC"/"Facility" mean warehouse). The MAP stage's layer-1
-- exact-synonym match is the cheapest, most trustworthy signal, so we widen it
-- here. Content inference + the manual remap screen remain the safety net for
-- anything still unseen.
--
-- Idempotent: re-runnable via on conflict (canonical_field, synonym, kind).
-- All synonyms are stored lowercased/space-normalized to match the client's
-- normalize() (accents stripped, non-alnum → single space).
------------------------------------------------------------------
insert into public.import_synonyms (canonical_field, synonym, kind, maps_to) values
  -- make
  ('make', 'brand', 'header', null),
  ('make', 'manufacturer', 'header', null),
  ('make', 'oem', 'header', null),
  ('make', 'vendor', 'header', null),
  -- model (device/product names)
  ('model', 'device', 'header', null),
  ('model', 'model name', 'header', null),
  ('model', 'device model', 'header', null),
  ('model', 'product', 'header', null),
  ('model', 'product name', 'header', null),
  ('model', 'item', 'header', null),
  ('model', 'item name', 'header', null),
  ('model', 'handset', 'header', null),
  -- model_number (part numbers / SKUs)
  ('model_number', 'part no', 'header', null),
  ('model_number', 'part number', 'header', null),
  ('model_number', 'part', 'header', null),
  ('model_number', 'model no', 'header', null),
  ('model_number', 'model number mpn', 'header', null),
  ('model_number', 'sku', 'header', null),
  ('model_number', 'item number', 'header', null),
  ('model_number', 'a number', 'header', null),
  -- capacity (storage/memory/size)
  ('capacity', 'storage', 'header', null),
  ('capacity', 'memory', 'header', null),
  ('capacity', 'size', 'header', null),
  ('capacity', 'storage size', 'header', null),
  ('capacity', 'storage capacity', 'header', null),
  ('capacity', 'gb', 'header', null),
  -- color (incl. British spelling)
  ('color', 'colour', 'header', null),
  ('color', 'color name', 'header', null),
  ('color', 'colour name', 'header', null),
  -- grade / condition
  ('grade', 'condition', 'header', null),
  ('grade', 'cond', 'header', null),
  ('grade', 'cosmetic', 'header', null),
  ('grade', 'cosmetic grade', 'header', null),
  ('grade', 'cosmetics', 'header', null),
  ('grade', 'grade level', 'header', null),
  ('grade', 'quality', 'header', null),
  -- carrier / network
  ('carrier', 'network', 'header', null),
  ('carrier', 'carrier network', 'header', null),
  ('carrier', 'network carrier', 'header', null),
  ('carrier', 'service provider', 'header', null),
  ('carrier', 'sim carrier', 'header', null),
  -- lock_status
  ('lock_status', 'sim lock', 'header', null),
  ('lock_status', 'network lock', 'header', null),
  ('lock_status', 'lock state', 'header', null),
  ('lock_status', 'unlock status', 'header', null),
  ('lock_status', 'locked unlocked', 'header', null),
  -- quantity (availability/stock)
  ('quantity', 'available', 'header', null),
  ('quantity', 'avail', 'header', null),
  ('quantity', 'available qty', 'header', null),
  ('quantity', 'qty avail', 'header', null),
  ('quantity', 'in stock', 'header', null),
  ('quantity', 'stock', 'header', null),
  ('quantity', 'stock count', 'header', null),
  ('quantity', 'count', 'header', null),
  ('quantity', 'units available', 'header', null),
  ('quantity', 'quantity on hand', 'header', null),
  ('quantity', 'qoh', 'header', null),
  -- cost (buy/wholesale/unit price)
  ('cost', 'unit price', 'header', null),
  ('cost', 'unit price usd', 'header', null),
  ('cost', 'buy price', 'header', null),
  ('cost', 'buy cost', 'header', null),
  ('cost', 'wholesale', 'header', null),
  ('cost', 'wholesale cost', 'header', null),
  ('cost', 'wholesale price', 'header', null),
  ('cost', 'cost each', 'header', null),
  ('cost', 'our cost', 'header', null),
  ('cost', 'purchase price', 'header', null),
  ('cost', 'list price', 'header', null),
  ('cost', 'price usd', 'header', null),
  -- warehouse (depot/dc/facility)
  ('warehouse', 'depot', 'header', null),
  ('warehouse', 'dc', 'header', null),
  ('warehouse', 'facility', 'header', null),
  ('warehouse', 'warehouse code', 'header', null),
  ('warehouse', 'wh code', 'header', null),
  ('warehouse', 'hub', 'header', null),
  ('warehouse', 'branch', 'header', null),
  ('warehouse', 'stock location', 'header', null),
  -- category
  ('category', 'type', 'header', null),
  ('category', 'product type', 'header', null),
  ('category', 'device type', 'header', null)
on conflict (canonical_field, synonym, kind) do update
  set maps_to = excluded.maps_to;
