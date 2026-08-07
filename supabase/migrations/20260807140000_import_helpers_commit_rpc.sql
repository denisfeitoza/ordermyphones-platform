-- 20260807140000_import_helpers_commit_rpc.sql
-- Phase 2 Smart Stock Import core: deterministic SKU/carrier/grade helpers
-- and the transactional commit_stock_import RPC per
-- docs/architecture/SMART-STOCK-IMPORT.md (six-stage pipeline, stage 6
-- COMMIT) and docs/architecture/PRODUCT-CATALOG-STANDARD.md §6/§7.
--
-- Policy call convention (unchanged from Phase 1): helpers are SECURITY
-- DEFINER, owner postgres, search_path = '' (fully schema-qualified bodies),
-- EXECUTE revoked from public/anon/authenticated — only commit_stock_import
-- calls them, and it can because the function owner (postgres) retains
-- implicit EXECUTE on its own functions regardless of the revoke.
--
-- D16 (repo is PUBLIC): no real supplier legal name anywhere in this file.

------------------------------------------------------------------
-- A. public.omp_make_sku — deterministic canonical SKU.
-- Mirrored BYTE-FOR-BYTE in apps/web/src/lib/import/sku.ts (makeSku). Any
-- change here must be mirrored there or SKUs computed client-side (dry-run
-- preview) will diverge from the server-authoritative SKU written at commit.
------------------------------------------------------------------
create or replace function public.omp_make_sku(
  p_model    text,
  p_capacity text,
  p_grade    text,
  p_carrier  public.carrier_code,
  p_lock     public.lock_status
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
    upper(regexp_replace(coalesce(p_capacity, ''), '[^a-zA-Z0-9]', '', 'g')),
    upper(regexp_replace(replace(replace(coalesce(p_grade, ''), '+', 'P'), '-', 'M'), '[^a-zA-Z0-9]', '', 'g')),
    p_carrier::text,
    case p_lock when 'locked'::public.lock_status then 'L' else 'U' end
  )
$$;

comment on function public.omp_make_sku(text, text, text, public.carrier_code, public.lock_status) is
  'Deterministic canonical SKU. Algorithm mirrored byte-for-byte in apps/web/src/lib/import/sku.ts — keep both in lockstep.';

------------------------------------------------------------------
-- B. public.omp_fold_carrier — raw carrier string -> canonical carrier_code.
-- Direct enum-label match first, then public.import_synonyms (kind =
-- 'carrier_value'), else 'OTH' (PRODUCT-CATALOG-STANDARD.md §4: an unknown
-- carrier never blocks the row, it folds to OTH with a warning raised by the
-- caller).
------------------------------------------------------------------
create or replace function public.omp_fold_carrier(p_raw text)
returns public.carrier_code
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_norm    text := upper(trim(coalesce(p_raw, '')));
  v_mapped  text;
begin
  if v_norm = '' then
    return 'OTH';
  end if;

  begin
    return v_norm::public.carrier_code;
  exception when invalid_text_representation then
    -- not a bare enum label, fall through to the synonym dictionary
    null;
  end;

  select maps_to into v_mapped
  from public.import_synonyms
  where kind = 'carrier_value'
    and upper(trim(synonym)) = v_norm
  limit 1;

  if v_mapped is not null then
    return v_mapped::public.carrier_code;
  end if;

  return 'OTH';
end;
$$;

comment on function public.omp_fold_carrier(text) is
  'Folds a raw vendor carrier string to the canonical carrier_code. Direct enum-label match, then public.import_synonyms (kind=carrier_value), else OTH. Never rejects a row.';

------------------------------------------------------------------
-- C. public.omp_grade_scale — vendor grade prefix -> grade_scale.
------------------------------------------------------------------
create or replace function public.omp_grade_scale(p_grade text)
returns public.grade_scale
language sql
immutable
security definer
set search_path = ''
as $$
  select case
    when p_grade ilike 'DLS%' then 'DLS'::public.grade_scale
    when p_grade ilike 'TPS%' then 'TPS'::public.grade_scale
    else 'OTHER'::public.grade_scale
  end
$$;

comment on function public.omp_grade_scale(text) is
  'DLS%% -> DLS, TPS%% -> TPS, else OTHER. Pure prefix classification, not a CTIA mapping.';

------------------------------------------------------------------
-- D. public.omp_grade_to_ctia — (vendor_code, vendor_grade) -> ctia_grade,
-- via public.vendor_grade_map. Null (unmapped) is a valid, expected result —
-- the caller (commit_stock_import) routes it to grade_classification_queue
-- and gates it to CTIA C for pricing, per PRODUCT-CATALOG-STANDARD.md §3.
------------------------------------------------------------------
create or replace function public.omp_grade_to_ctia(p_vendor_code text, p_vendor_grade text)
returns public.ctia_grade
language sql
stable
security definer
set search_path = ''
as $$
  select ctia
  from public.vendor_grade_map
  where vendor_code = p_vendor_code
    and upper(vendor_grade) = upper(trim(coalesce(p_vendor_grade, '')))
  limit 1
$$;

comment on function public.omp_grade_to_ctia(text, text) is
  'Case-insensitive lookup into vendor_grade_map. Returns null when unmapped — that is expected, not an error; the caller queues it in grade_classification_queue and gates to CTIA C.';

------------------------------------------------------------------
-- E. Lock down the four helpers — only commit_stock_import (below) calls
-- them, as the function owner (postgres), which retains implicit EXECUTE on
-- its own functions regardless of these revokes.
------------------------------------------------------------------
revoke execute on function public.omp_make_sku(text, text, text, public.carrier_code, public.lock_status) from public, anon, authenticated;
revoke execute on function public.omp_fold_carrier(text) from public, anon, authenticated;
revoke execute on function public.omp_grade_scale(text) from public, anon, authenticated;
revoke execute on function public.omp_grade_to_ctia(text, text) from public, anon, authenticated;

------------------------------------------------------------------
-- F. public.commit_stock_import — stage 6 COMMIT of the pipeline
-- (SMART-STOCK-IMPORT.md). Transactional: normalizes + validates every row
-- (reject with a reason, never a silent drop), resolves product / variant /
-- location, groups accepted rows by (variant_id, location_id) with
-- last-wins semantics (idempotency + collision handling), writes exactly one
-- ledger movement per changed pair, and audits the run in import_runs.
--
-- Row shape expected in each element of p_rows (matches the TS
-- CommitStockImportRow contract in apps/web/src/lib/import/commit.ts):
--   make, model, model_number, category, capacity, color, vendor_grade,
--   carrier_raw, lock_raw, cost_cents (bigint), currency, qty_raw,
--   warehouse_code, warehouse_name.
--
-- Assumptions beyond the literal row-level mandatory list (documented here
-- because they are load-bearing for the NOT NULL columns downstream):
--   * model_number is treated as mandatory alongside make/model/capacity/
--     warehouse_code, because products.model_number is NOT NULL and is half
--     of the product natural key (PRODUCT-CATALOG-STANDARD.md §2.1).
--   * category must resolve to one of phones/accessories/wearables
--     (products.category is a NOT NULL enum) — an unrecognized value rejects
--     the row as 'bad_category' rather than raising and aborting the batch.
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
      vendor_grade as grade, grade_scale, model
    from tmp_import_rows
    where accepted
    order by product_id, capacity, coalesce(color, ''), carrier, lock_status, vendor_grade, rn desc
  )
  insert into public.product_variants (
    product_id, capacity, color, carrier, carrier_raw, lock_status, grade, grade_scale, sku
  )
  select product_id, capacity, color, carrier, carrier_raw, lock_status, grade, grade_scale,
         public.omp_make_sku(model, capacity, grade, carrier, lock_status)
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
  'Stage 6 COMMIT of the Smart Stock Import pipeline (SMART-STOCK-IMPORT.md). Admin/staff only (checked first). Validates every row with a reason (never a silent drop), groups accepted rows by (variant_id, location_id) with last-wins semantics before computing deltas, and writes exactly one ledger movement per changed pair. merge = only rows present in the sheet are adjusted; replace_location = every other balance at the chosen location is zeroed first, both expressed as audited stock_movements rows.';

revoke execute on function public.commit_stock_import(uuid, text, text, text, text, jsonb, text) from public, anon;
grant execute on function public.commit_stock_import(uuid, text, text, text, text, jsonb, text) to authenticated;
