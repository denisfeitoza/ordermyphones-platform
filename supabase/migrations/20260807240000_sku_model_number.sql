-- 20260807240000_sku_model_number.sql
-- Definitive SKU-uniqueness fix, surfaced by the real 2,675-row HYLA import.
--
-- Root cause (confirmed against the live feed): product_variants' natural key
-- is (product_id, capacity, COALESCE(color,''), carrier, lock_status, grade),
-- and product_id resolves from (make, MODEL_NUMBER) — NOT the model TEXT. But
-- omp_make_sku built the SKU from the model NAME ("iPhone 15 Pro Max"), so 40
-- models in the real feed that share ONE name across MULTIPLE model_numbers
-- (iPhone 15 Pro Max = A2849 AND A3106; iPhone 12 = A2172/A2403/A2402) are
-- DIFFERENT products (distinct natural key) that computed the SAME sku → the
-- second insert violates product_variants_sku_key and the whole import aborts.
-- The color fix in 20260807230000 was necessary but not sufficient: same name +
-- same color + same everything-else but a different model_number still collided.
--
-- Fix: model_number becomes part of the SKU so the SKU is injective from the
-- natural key. The canonical SKU is now
--   MODELSLUG-MODELNUMBER-CAP-COLOR-GRADE-CARRIER-LOCK
-- — a MODEL_NUMBER token is inserted right AFTER the (human-readable) model
-- slug and BEFORE capacity. The model slug is kept for readability; the
-- model_number token is what actually disambiguates. commit_stock_import is
-- re-authored identical to 20260807230000 (color + reprice hook preserved)
-- EXCEPT (a) distinct_variants now also selects model_number and (b) the single
-- omp_make_sku call site passes it.
--
-- Policy call convention unchanged: helper is SECURITY DEFINER, owner postgres,
-- search_path = '', immutable, EXECUTE revoked from public/anon/authenticated
-- (only commit_stock_import calls it, as the owner).
--
-- DB is empty (the failed import rolled back) — safe to change the SKU format.
-- D16 (repo is PUBLIC): no real supplier legal name anywhere in this file.

------------------------------------------------------------------
-- A. public.omp_make_sku — deterministic canonical SKU, now model_number-aware.
-- Mirrored BYTE-FOR-BYTE in apps/web/src/lib/import/sku.ts (makeSku). Any
-- change here must be mirrored there or SKUs computed client-side (dry-run
-- preview) will diverge from the server-authoritative SKU written at commit.
------------------------------------------------------------------
create or replace function public.omp_make_sku(
  p_model        text,
  p_model_number text,
  p_capacity     text,
  p_color        text,
  p_grade        text,
  p_carrier      public.carrier_code,
  p_lock         public.lock_status
)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select concat_ws(
    '-',
    upper(regexp_replace(p_model, '[^a-zA-Z0-9]', '', 'g')),
    upper(regexp_replace(coalesce(p_model_number, ''), '[^a-zA-Z0-9]', '', 'g')),
    upper(regexp_replace(coalesce(p_capacity, ''), '[^a-zA-Z0-9]', '', 'g')),
    upper(regexp_replace(coalesce(p_color, ''), '[^a-zA-Z0-9]', '', 'g')),
    upper(regexp_replace(replace(replace(coalesce(p_grade, ''), '+', 'P'), '-', 'M'), '[^a-zA-Z0-9]', '', 'g')),
    p_carrier::text,
    case p_lock when 'locked'::public.lock_status then 'L' else 'U' end
  )
$$;

comment on function public.omp_make_sku(text, text, text, text, text, public.carrier_code, public.lock_status) is
  'Deterministic canonical SKU MODELSLUG-MODELNUMBER-CAP-COLOR-GRADE-CARRIER-LOCK. model_number is part of the key so two products sharing one model name across different model_numbers (iPhone 15 Pro Max = A2849 vs A3106) get distinct SKUs — this is what makes the SKU injective from the (make, model_number, capacity, color, carrier, lock, grade) natural key and keeps product_variants_sku_key from colliding. Color is also part of the key. Algorithm mirrored byte-for-byte in apps/web/src/lib/import/sku.ts — keep both in lockstep.';

-- Drop the old 6-arg overload: it computed a model_number-blind SKU that
-- collides across model_numbers, and nothing should call it anymore.
-- commit_stock_import (re-authored below) calls only the new 7-arg form.
drop function if exists public.omp_make_sku(text, text, text, text, public.carrier_code, public.lock_status);

-- Only commit_stock_import calls this, as the function owner (postgres), which
-- retains implicit EXECUTE on its own functions regardless of this revoke.
revoke execute on function public.omp_make_sku(text, text, text, text, text, public.carrier_code, public.lock_status) from public, anon, authenticated;

------------------------------------------------------------------
-- B. public.commit_stock_import — re-authored byte-identical to
-- 20260807230000_sku_include_color.sql EXCEPT (a) distinct_variants now also
-- selects model_number and (b) the one omp_make_sku call site passes it. The
-- reprice hook (perform public.reprice_variants(...)) and every other line are
-- preserved verbatim.
------------------------------------------------------------------
create or replace function public.commit_stock_import(
  p_supplier_id        uuid,
  p_vendor_code        text,
  p_mode               text,
  p_source_label       text,
  p_header_fingerprint text,
  p_rows               jsonb,
  p_location_code      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import_run_id      uuid;
  v_target_location_id uuid;
  v_rows_total          integer;
  v_rows_accepted        integer;
  v_rows_rejected         integer;
  v_movements_written      integer;
  v_reject_json             jsonb;
  v_warnings_json            jsonb;
  v_combined_json              jsonb;
begin
  -- Authorization gate, first statement in the function body.
  if not (select public.is_admin_or_staff()) then
    raise exception 'not authorized';
  end if;

  set local statement_timeout = '120s';

  if p_mode not in ('merge', 'replace_location') then
    raise exception 'invalid mode %, expected merge or replace_location', p_mode;
  end if;

  if p_mode = 'replace_location' and p_location_code is null then
    raise exception 'replace_location requires p_location_code';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a jsonb array';
  end if;

  v_rows_total := jsonb_array_length(p_rows);

  ------------------------------------------------------------------
  -- 1. Stage rows (jsonb_to_recordset -> temp table). drop-if-exists first:
  -- "on commit drop" only fires at top-level transaction commit, so two
  -- calls inside one explicit transaction block would otherwise collide.
  ------------------------------------------------------------------
  drop table if exists tmp_import_rows;
  create temp table tmp_import_rows (
    rn              bigint primary key,
    make            text,
    model           text,
    model_number    text,
    category        text,
    capacity        text,
    color           text,
    vendor_grade    text,
    carrier_raw     text,
    lock_raw        text,
    cost_cents      bigint,
    currency        text,
    qty_raw         text,
    warehouse_code  text,
    warehouse_name  text,
    accepted        boolean not null default true,
    reject_reason   text,
    warnings        text[] not null default '{}',
    carrier         public.carrier_code,
    lock_status     public.lock_status,
    qty             integer,
    qty_is_floor    boolean not null default false,
    grade_scale     public.grade_scale,
    ctia            public.ctia_grade,
    product_id      uuid,
    variant_id      uuid,
    location_id     uuid
  ) on commit drop;

  -- jsonb_array_elements(...) WITH ORDINALITY gives each element a stable row
  -- number (needed for reject_reasons {row, reason}); jsonb_to_record then
  -- shreds that single element into typed columns via LATERAL. Deliberately
  -- NOT jsonb_to_recordset(...) WITH ORDINALITY directly — combining a
  -- set-returning function's explicit column-definition list with WITH
  -- ORDINALITY in one FROM item is an ambiguous/fragile combination; this
  -- two-step form is the documented-safe idiom for the same result.
  insert into tmp_import_rows (
    rn, make, model, model_number, category, capacity, color, vendor_grade,
    carrier_raw, lock_raw, cost_cents, currency, qty_raw, warehouse_code, warehouse_name
  )
  select e.rn, r.make, r.model, r.model_number, r.category, r.capacity, r.color, r.vendor_grade,
         r.carrier_raw, r.lock_raw, r.cost_cents, r.currency, r.qty_raw, r.warehouse_code, r.warehouse_name
  from jsonb_array_elements(p_rows) with ordinality as e(elem, rn)
  cross join lateral jsonb_to_record(e.elem) as r(
    make text, model text, model_number text, category text, capacity text, color text,
    vendor_grade text, carrier_raw text, lock_raw text, cost_cents bigint, currency text,
    qty_raw text, warehouse_code text, warehouse_name text
  );

  ------------------------------------------------------------------
  -- 2. VALIDATE — never a silent drop; every reject carries a reason.
  ------------------------------------------------------------------
  update tmp_import_rows
     set accepted = false, reject_reason = 'missing_mandatory'
   where accepted
     and (
       coalesce(trim(make), '')           = '' or
       coalesce(trim(model), '')          = '' or
       coalesce(trim(model_number), '')   = '' or
       coalesce(trim(capacity), '')       = '' or
       coalesce(trim(warehouse_code), '') = ''
     );

  update tmp_import_rows
     set accepted = false, reject_reason = 'bad_category'
   where accepted
     and lower(coalesce(trim(category), '')) not in ('phones', 'accessories', 'wearables');

  update tmp_import_rows
     set accepted = false, reject_reason = 'bad_cost'
   where accepted
     and (cost_cents is null or cost_cents <= 0);

  -- qty: plain integer, or a masked "200+" floor. Anything else rejects.
  update tmp_import_rows
     set qty = trim(qty_raw)::int, qty_is_floor = false
   where accepted and qty_raw ~ '^\s*\d+\s*$';

  update tmp_import_rows
     set qty = regexp_replace(qty_raw, '\D', '', 'g')::int, qty_is_floor = true
   where accepted and qty_raw ~ '^\s*\d+\s*\+\s*$';

  update tmp_import_rows
     set accepted = false, reject_reason = 'bad_qty'
   where accepted and qty is null;

  -- carrier: fold, warn (never reject) on an unmapped raw value.
  update tmp_import_rows
     set carrier = public.omp_fold_carrier(carrier_raw)
   where accepted;

  update tmp_import_rows
     set warnings = array_append(warnings, 'carrier_unmapped')
   where accepted
     and carrier = 'OTH'
     and coalesce(trim(carrier_raw), '') <> ''
     and upper(trim(carrier_raw)) <> 'OTH';

  -- lock_status: 'locked' only when the raw value starts with "lock"
  -- (covers 'locked', 'lock', 'Lock'); everything else, including blank,
  -- defaults to 'unlocked'.
  update tmp_import_rows
     set lock_status = case when lock_raw ilike 'lock%' then 'locked'::public.lock_status
                             else 'unlocked'::public.lock_status end
   where accepted;

  -- grade: verbatim, never rejected. Unmapped -> classification queue,
  -- gated to CTIA C for pricing (not written here — no ctia column exists
  -- on product_variants by design; see 20260806120100 comment).
  update tmp_import_rows
     set grade_scale = public.omp_grade_scale(vendor_grade),
         ctia        = public.omp_grade_to_ctia(p_vendor_code, vendor_grade)
   where accepted;

  update tmp_import_rows
     set warnings = array_append(warnings, 'grade_unmapped')
   where accepted and ctia is null and coalesce(trim(vendor_grade), '') <> '';

  insert into public.grade_classification_queue (vendor_code, vendor_grade, occurrences)
  select p_vendor_code, vendor_grade, count(*)
  from tmp_import_rows
  where accepted and ctia is null and coalesce(trim(vendor_grade), '') <> ''
  group by vendor_grade
  on conflict (vendor_code, vendor_grade) do update
    set occurrences = public.grade_classification_queue.occurrences + excluded.occurrences;

  v_rows_accepted := (select count(*) from tmp_import_rows where accepted);
  v_rows_rejected := v_rows_total - v_rows_accepted;

  ------------------------------------------------------------------
  -- 3. RESOLVE — product / variant / location, upserted from the accepted
  -- rows only. distinct on (..., rn desc) gives last-wins within the batch
  -- when the same natural key repeats (e.g. two carrier spellings folding
  -- to the same variant).
  ------------------------------------------------------------------
  with distinct_products as (
    select distinct on (make, model_number)
      make, model, model_number, lower(trim(category))::public.product_category as category
    from tmp_import_rows
    where accepted
    order by make, model_number, rn desc
  )
  insert into public.products (make, model, model_number, category)
  select make, model, model_number, category from distinct_products
  on conflict (make, model_number) do update
    set model = excluded.model, category = excluded.category;

  update tmp_import_rows t
     set product_id = p.id
    from public.products p
   where t.accepted and p.make = t.make and p.model_number = t.model_number;

  with distinct_variants as (
    select distinct on (product_id, capacity, coalesce(color, ''), carrier, lock_status, vendor_grade)
      product_id, capacity, color, carrier, carrier_raw, lock_status,
      vendor_grade as grade, grade_scale, model, model_number
    from tmp_import_rows
    where accepted
    order by product_id, capacity, coalesce(color, ''), carrier, lock_status, vendor_grade, rn desc
  )
  insert into public.product_variants (
    product_id, capacity, color, carrier, carrier_raw, lock_status, grade, grade_scale, sku
  )
  select product_id, capacity, color, carrier, carrier_raw, lock_status, grade, grade_scale,
         public.omp_make_sku(model, model_number, capacity, color, grade, carrier, lock_status)
  from distinct_variants
  on conflict (product_id, capacity, coalesce(color, ''), carrier, lock_status, grade) do update
    set carrier_raw = excluded.carrier_raw, sku = excluded.sku;

  update tmp_import_rows t
     set variant_id = v.id
    from public.product_variants v
   where t.accepted
     and v.product_id = t.product_id
     and v.capacity = t.capacity
     and coalesce(v.color, '') = coalesce(t.color, '')
     and v.carrier = t.carrier
     and v.lock_status = t.lock_status
     and v.grade = t.vendor_grade;

  -- Location auto-create only (on conflict do nothing): an admin rename in
  -- the panel must never be silently clobbered by a later re-import.
  with distinct_locations as (
    select distinct on (warehouse_code) warehouse_code, warehouse_name
    from tmp_import_rows
    where accepted
    order by warehouse_code, rn desc
  )
  insert into public.stock_locations (code, display_name, supplier_id)
  select warehouse_code, coalesce(nullif(trim(warehouse_name), ''), warehouse_code), p_supplier_id
  from distinct_locations
  on conflict (code) do nothing;

  update tmp_import_rows t
     set location_id = l.id
    from public.stock_locations l
   where t.accepted and l.code = t.warehouse_code;

  ------------------------------------------------------------------
  -- 4. GROUP by (variant_id, location_id) BEFORE computing delta — this is
  -- the idempotency + collision guard: two source rows that differ only by
  -- carrier spelling (e.g. "Verizon" vs "VZW") resolve to the same variant
  -- and must collapse to ONE target, last-wins on qty/cost.
  ------------------------------------------------------------------
  drop table if exists tmp_import_grouped;
  create temp table tmp_import_grouped on commit drop as
  select distinct on (variant_id, location_id)
    variant_id, location_id, qty as target_qty, qty_is_floor,
    cost_cents as unit_cost_cents, coalesce(currency, 'USD') as currency
  from tmp_import_rows
  where accepted
  order by variant_id, location_id, rn desc;

  ------------------------------------------------------------------
  -- 5. Audit row first — movements below need its id for ref_id.
  ------------------------------------------------------------------
  select coalesce(jsonb_agg(jsonb_build_object('row', rn, 'reason', reject_reason, 'type', 'reject')), '[]'::jsonb)
    into v_reject_json
  from tmp_import_rows
  where not accepted;

  select coalesce(jsonb_agg(jsonb_build_object('row', rn, 'reason', w, 'type', 'warning')), '[]'::jsonb)
    into v_warnings_json
  from tmp_import_rows, unnest(warnings) as w
  where accepted;

  v_combined_json := v_reject_json || v_warnings_json;

  insert into public.import_runs (
    supplier_id, location_scope, mode, source_label, header_fingerprint,
    rows_total, rows_accepted, rows_rejected, movements_written, reject_reasons, actor_id
  ) values (
    p_supplier_id,
    case when p_mode = 'replace_location' then p_location_code else null end,
    p_mode, p_source_label, p_header_fingerprint,
    v_rows_total, v_rows_accepted, v_rows_rejected, 0, v_combined_json, auth.uid()
  )
  returning id into v_import_run_id;

  if p_mode = 'replace_location' then
    select id into v_target_location_id from public.stock_locations where code = p_location_code;
    if v_target_location_id is null then
      raise exception 'unknown location_code %', p_location_code;
    end if;

    -- Zero out every existing balance at the target location that is NOT
    -- present in this sheet — the "replace" half of replace_location, still
    -- expressed as an audited ledger movement.
    insert into public.stock_movements (
      variant_id, location_id, delta, reason, ref_type, ref_id, unit_cost_cents, actor_id, note
    )
    select i.variant_id, i.location_id, -i.qty, 'import_replace', 'import_runs', v_import_run_id,
           i.unit_cost_cents, auth.uid(), p_source_label
    from public.inventory i
    where i.location_id = v_target_location_id
      and i.qty <> 0
      and not exists (
        select 1 from tmp_import_grouped g
        where g.location_id = v_target_location_id and g.variant_id = i.variant_id
      );
  end if;

  ------------------------------------------------------------------
  -- 6. Delta movements for every touched (variant, location) pair.
  -- merge mode: reason import_adjust everywhere. replace_location mode:
  -- import_replace for pairs at the target location, import_adjust for any
  -- other location the sheet happened to also carry.
  ------------------------------------------------------------------
  insert into public.stock_movements (
    variant_id, location_id, delta, reason, ref_type, ref_id, unit_cost_cents, actor_id, note
  )
  select g.variant_id, g.location_id,
         g.target_qty - coalesce(i.qty, 0) as delta,
         case when p_mode = 'replace_location' and g.location_id = v_target_location_id
              then 'import_replace'::public.movement_reason
              else 'import_adjust'::public.movement_reason end,
         'import_runs', v_import_run_id, g.unit_cost_cents, auth.uid(), p_source_label
  from tmp_import_grouped g
  left join public.inventory i on i.variant_id = g.variant_id and i.location_id = g.location_id
  where g.target_qty - coalesce(i.qty, 0) <> 0;

  -- Cost/as_of/qty_is_floor/source_import_id refresh for every touched pair
  -- — including zero-delta re-imports, where only the observation metadata
  -- changes. qty is never written here; the ledger trigger above owns it.
  insert into public.inventory (
    variant_id, location_id, qty, unit_cost_cents, currency, qty_is_floor, as_of, source_import_id
  )
  select g.variant_id, g.location_id, 0, g.unit_cost_cents, g.currency, g.qty_is_floor, now(), v_import_run_id
  from tmp_import_grouped g
  on conflict (variant_id, location_id) do update
    set unit_cost_cents  = excluded.unit_cost_cents,
        currency         = excluded.currency,
        qty_is_floor     = excluded.qty_is_floor,
        as_of            = now(),
        source_import_id = excluded.source_import_id;

  -- Auto-reprice every variant touched by this import, now that inventory
  -- (cost_cents in particular) reflects the committed rows. reprice_variants
  -- is postgres-owned SECURITY DEFINER with EXECUTE revoked from
  -- public/anon/authenticated (20260807150000); commit_stock_import can call
  -- it as the function owner regardless of that revoke, same mechanism as
  -- the omp_* helpers above.
  perform public.reprice_variants(array(select distinct g.variant_id from tmp_import_grouped g));

  select count(*) into v_movements_written
  from public.stock_movements
  where ref_type = 'import_runs' and ref_id = v_import_run_id;

  update public.import_runs set movements_written = v_movements_written where id = v_import_run_id;

  return jsonb_build_object(
    'import_run_id', v_import_run_id,
    'rows_total', v_rows_total,
    'rows_accepted', v_rows_accepted,
    'rows_rejected', v_rows_rejected,
    'movements_written', v_movements_written,
    'reject_reasons', v_reject_json,
    'warnings', v_warnings_json
  );
end;
$$;

comment on function public.commit_stock_import(uuid, text, text, text, text, jsonb, text) is
  'Stage 6 COMMIT of the Smart Stock Import pipeline (SMART-STOCK-IMPORT.md). Admin/staff only (checked first). Validates every row with a reason (never a silent drop), groups accepted rows by (variant_id, location_id) with last-wins semantics before computing deltas, and writes exactly one ledger movement per changed pair. merge = only rows present in the sheet are adjusted; replace_location = every other balance at the chosen location is zeroed first, both expressed as audited stock_movements rows. SKU is model_number- and color-aware (omp_make_sku 7-arg) so two products sharing one model name across different model_numbers (iPhone 15 Pro Max A2849 vs A3106) no longer collide on product_variants_sku_key. After the inventory refresh, every touched variant is auto-repriced via public.reprice_variants.';

revoke execute on function public.commit_stock_import(uuid, text, text, text, text, jsonb, text) from public, anon;
grant execute on function public.commit_stock_import(uuid, text, text, text, text, jsonb, text) to authenticated;
