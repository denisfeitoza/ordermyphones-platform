-- 20260807150000_pricing_engine.sql
-- Pricing Engine v2 — core waterfall (docs/architecture/PRICING-ENGINE.md,
-- reference: services/pricing-batch/reference/pricing_engine.py). Builds on
-- the scaffold in 20260806120400_pricing_scaffold.sql (tiers, pricing_settings,
-- vendor_grade_map, prices, pricing_flags already exist and are seeded).
--
-- Does NOT touch public.commit_stock_import — the orchestrator wires the
-- post-import reprice hook in a separate migration.
--
-- Policy/style convention (unchanged from Phase 1/2): SECURITY DEFINER
-- helpers owned by postgres, `set search_path = ''` (fully schema-qualified
-- bodies), EXECUTE revoked from public/anon/authenticated unless a specific
-- grant is called out. Enum literals are cast explicitly
-- (`'consumer'::public.customer_tier`) because an empty search_path means an
-- unqualified enum cast only resolves by accident of pg_catalog fallback for
-- built-ins, never for a public-schema type.

------------------------------------------------------------------
-- A. public.omp_band_add — cost-plus ADD amount for T3/T4.
-- Mirrors reference band_markup() + the premium-cost percentage-cap step
-- (pricing_engine.py lines 176-180, 236-238): walk the bands array IN ORDER
-- (jsonb array order, not a re-sort — `with ordinality` preserves it) and
-- return the markup_cents of the first band whose max_cost_cents is null
-- (open-ended top band) or exceeds the cost. If the cost is above the
-- premium threshold, cap the result at floor(cost * pct_cap) — `least()`,
-- matching the reference's `min(markup, cost*cap)`.
------------------------------------------------------------------
create or replace function public.omp_band_add(
  p_cost_cents        bigint,
  p_bands              jsonb,
  p_pct_cap            numeric,
  p_premium_threshold  bigint
)
returns bigint
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v_band_add bigint;
  v_cap      bigint;
begin
  select (t.band ->> 'markup_cents')::bigint
    into v_band_add
  from jsonb_array_elements(p_bands) with ordinality as t(band, ord)
  where (t.band ->> 'max_cost_cents') is null
     or p_cost_cents < (t.band ->> 'max_cost_cents')::bigint
  order by t.ord
  limit 1;

  if v_band_add is null then
    raise exception 'omp_band_add: no band matched cost_cents=% against bands=%',
      p_cost_cents, p_bands;
  end if;

  if p_premium_threshold is not null and p_cost_cents > p_premium_threshold then
    v_cap := floor(p_cost_cents * p_pct_cap)::bigint;
    return least(v_band_add, v_cap);
  end if;

  return v_band_add;
end;
$$;

comment on function public.omp_band_add(bigint, jsonb, numeric, bigint) is
  'Cost-plus ADD amount for T3/T4 (PRICING-ENGINE.md §4 step 3). Walks the bands jsonb array in its stored order and returns the first band whose ceiling the cost is under; caps at cost*pct_cap when cost exceeds the premium threshold. Pure function of its inputs — internal helper for reprice_variants only.';

revoke execute on function public.omp_band_add(bigint, jsonb, numeric, bigint) from public, anon, authenticated;

------------------------------------------------------------------
-- B. public.reprice_variants — the waterfall (PRICING-ENGINE.md §4).
-- SECURITY DEFINER, no admin/staff gate: this is an internal engine entry
-- point, not a customer- or even admin-facing RPC. EXECUTE is revoked from
-- every PostgREST-facing role below; only the function owner (postgres) and
-- anything else owned by postgres can call it — the same mechanism
-- commit_stock_import already relies on for the four omp_* import helpers
-- (20260807140000, section E). The orchestrator's post-import reprice hook
-- will call this from inside commit_stock_import (or an equivalent
-- postgres-owned SECURITY DEFINER caller) in a later migration — that call
-- works with zero additional grants. Do not "fix" the revoke by granting
-- execute to authenticated; that would let any signed-in customer trigger a
-- full repricing pass directly via PostgREST.
------------------------------------------------------------------
create or replace function public.reprice_variants(p_variant_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- ---- settings, loaded once before the loop; fail loud on a missing key
  -- rather than silently repricing against null (CLAUDE.md §4: no
  -- swallowed-error "fix"). ----
  v_settings                jsonb;
  v_wholesale_bands         jsonb;
  v_distributor_bands       jsonb;
  v_wholesale_pct_cap       numeric;
  v_distributor_pct_cap     numeric;
  v_premium_threshold       bigint;
  v_kit_premium_cents       bigint;
  v_kit_standard_cents      bigint;
  v_kit_premium_threshold   bigint;
  v_retailer_min_margin     bigint;

  v_floor_consumer          bigint;
  v_floor_retailer          bigint;
  v_floor_wholesale         bigint;
  v_floor_distributor       bigint;

  -- ---- per-variant working state ----
  v_variant_id       uuid;
  v_make             text;
  v_grade            text;
  v_ctia             public.ctia_grade;
  v_basis_cost       bigint;   -- bare cost: MAX(unit_cost_cents) among in-stock locations
  v_kit              bigint;
  v_t12_basis        bigint;   -- kitted basis for T1/T2

  v_w_add            bigint;
  v_d_add            bigint;
  v_w_price          bigint;
  v_d_price          bigint;
  v_w_visible        boolean;
  v_d_visible        boolean;
  v_w_flag           text;
  v_d_flag           text;

  v_consumer_eligible        boolean;
  v_existing_consumer_price  bigint;
  v_existing_consumer_source text;
  v_consumer_price           bigint;
  v_consumer_visible         boolean;
  v_consumer_flag            text;
  v_retailer_price           bigint;
  v_retailer_visible         boolean;
  v_retailer_flag            text;

  v_chain      bigint[];
  v_violation  boolean;
  v_i          int;
begin
  select jsonb_object_agg(key, value) into v_settings from public.pricing_settings;

  v_wholesale_bands       := v_settings -> 'wholesale_bands';
  v_distributor_bands     := v_settings -> 'distributor_bands';
  v_wholesale_pct_cap     := (v_settings ->> 'wholesale_pct_cap')::numeric;
  v_distributor_pct_cap   := (v_settings ->> 'distributor_pct_cap')::numeric;
  v_premium_threshold     := (v_settings ->> 'premium_cost_threshold_cents')::bigint;
  v_kit_premium_cents     := (v_settings ->> 'kit_cost_premium_cents')::bigint;
  v_kit_standard_cents    := (v_settings ->> 'kit_cost_standard_cents')::bigint;
  v_kit_premium_threshold := (v_settings ->> 'kit_premium_threshold_cents')::bigint;
  v_retailer_min_margin   := (v_settings ->> 'retailer_min_margin_cents')::bigint;

  if v_wholesale_bands is null or v_distributor_bands is null
     or v_wholesale_pct_cap is null or v_distributor_pct_cap is null
     or v_premium_threshold is null or v_kit_premium_cents is null
     or v_kit_standard_cents is null or v_kit_premium_threshold is null
     or v_retailer_min_margin is null then
    raise exception 'reprice_variants: pricing_settings is missing one or more required keys';
  end if;

  -- Floors live on tiers.floor_cents, not duplicated into pricing_settings
  -- (see 20260806120400 comment on public.pricing_settings) — one source of
  -- truth for the four profit floors.
  select floor_cents into v_floor_consumer    from public.tiers where code = 'consumer'::public.customer_tier;
  select floor_cents into v_floor_retailer    from public.tiers where code = 'retailer'::public.customer_tier;
  select floor_cents into v_floor_wholesale   from public.tiers where code = 'wholesale'::public.customer_tier;
  select floor_cents into v_floor_distributor from public.tiers where code = 'distributor'::public.customer_tier;

  if v_floor_consumer is null or v_floor_retailer is null
     or v_floor_wholesale is null or v_floor_distributor is null then
    raise exception 'reprice_variants: tiers.floor_cents missing for one or more tiers';
  end if;

  for v_variant_id in select distinct u from unnest(p_variant_ids) as u loop

    v_make := null;
    v_grade := null;

    select p.make, pv.grade
      into v_make, v_grade
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    where pv.id = v_variant_id;

    if v_make is null then
      -- Unknown variant id — nothing to price. Skip rather than raise, so
      -- one bad id in a batch does not abort the whole reprice run.
      continue;
    end if;

    ----------------------------------------------------------------
    -- Basis cost: highest unit_cost_cents among in-stock (qty>0)
    -- locations (SMART-STOCK-IMPORT.md "Cross-location cost spread": v1
    -- rule is conservative — price from the highest in-stock cost so no
    -- sale can land under any single location's band).
    ----------------------------------------------------------------
    select max(i.unit_cost_cents) into v_basis_cost
    from public.inventory i
    where i.variant_id = v_variant_id and i.qty > 0;

    if v_basis_cost is null then
      -- No in-stock location at all: delist every tier, flag zero_qty
      -- (PRICING-ENGINE.md §6 "zero-qty auto-delists"). Existing rows are
      -- hidden in place — price_cents is left untouched (a NOT NULL, >0
      -- column; there is nothing meaningful to write here, and the row is
      -- hidden anyway) rather than inserting a fabricated row for a variant
      -- that has never been priced.
      update public.prices
         set visible = false, flag_reason = 'zero_qty', computed_at = now()
       where variant_id = v_variant_id;

      insert into public.pricing_flags (variant_id, tier, kind, payload)
      select v_variant_id, null, 'zero_qty'::public.pricing_flag_kind,
             jsonb_build_object('reason', 'no in-stock location at reprice time')
      where not exists (
        select 1 from public.pricing_flags
        where variant_id = v_variant_id and tier is null
          and kind = 'zero_qty'::public.pricing_flag_kind
          and status = 'open'::public.pricing_flag_status
      );

      continue;
    end if;

    -- Stock is back: resolve any stale open zero_qty flag.
    update public.pricing_flags
       set status = 'resolved'::public.pricing_flag_status, resolved_at = now()
     where variant_id = v_variant_id and tier is null
       and kind = 'zero_qty'::public.pricing_flag_kind
       and status = 'open'::public.pricing_flag_status;

    ----------------------------------------------------------------
    -- CTIA grade. product_variants has no vendor_code column (by design —
    -- see 20260806120100), so vendor_grade_map is matched on the grade
    -- label alone, ignoring vendor_code. `order by ctia desc limit 1` makes
    -- the lookup deterministic if a second vendor ever maps the same label
    -- to a different CTIA grade: it picks the WORST (most conservative)
    -- match — ctia_grade's declared enum order is
    -- ('NEW','CPO','A','B','C','D'), so desc favors D/C over A/NEW, i.e.
    -- "when in doubt, gate it out of consumer/retailer" rather than the
    -- reverse. Unmapped grade -> CTIA C, same safe default as
    -- omp_grade_to_ctia / grade_classification_queue.
    ----------------------------------------------------------------
    select vgm.ctia into v_ctia
    from public.vendor_grade_map vgm
    where upper(trim(vgm.vendor_grade)) = upper(trim(v_grade))
    order by vgm.ctia desc
    limit 1;

    if v_ctia is null then
      v_ctia := 'C'::public.ctia_grade;
    end if;

    ----------------------------------------------------------------
    -- Kit cost (PRICING-ENGINE.md §1 "Kitting"): Apple, or cost at/above
    -- the premium threshold -> premium kit; else standard kit. T1/T2 basis
    -- is kitted; T3/T4 ship bare HSO and never see this add.
    ----------------------------------------------------------------
    v_kit := case
      when lower(trim(v_make)) = 'apple' or v_basis_cost >= v_kit_premium_threshold
        then v_kit_premium_cents
      else v_kit_standard_cents
    end;
    v_t12_basis := v_basis_cost + v_kit;

    ----------------------------------------------------------------
    -- T3 Wholesale. band add via omp_band_add; if the resulting add can't
    -- clear the wholesale floor, hide + flag margin rather than publish a
    -- sub-floor price (PRICING-ENGINE.md §6 "Floors are hard"). Under the
    -- current CONFIG this branch is effectively unreachable (every band ADD
    -- is >= $7 = 700c, floor_wholesale is 250c, and the pct cap only
    -- applies above an $800 cost where 4%/2.5% is still far above the
    -- floor) — it exists as a guard against Phase 7 making bands/caps
    -- admin-editable down to values that would violate the floor.
    ----------------------------------------------------------------
    v_w_add := public.omp_band_add(v_basis_cost, v_wholesale_bands, v_wholesale_pct_cap, v_premium_threshold);
    if v_w_add < v_floor_wholesale then
      v_w_price   := 1;   -- sentinel: never a real price, always hidden alongside it
      v_w_visible := false;
      v_w_flag    := 'margin';
    else
      v_w_price   := v_basis_cost + v_w_add;
      v_w_visible := true;
      v_w_flag    := null;
    end if;

    if v_w_flag = 'margin' then
      insert into public.pricing_flags (variant_id, tier, kind, payload)
      select v_variant_id, 'wholesale'::public.customer_tier, 'margin'::public.pricing_flag_kind,
             jsonb_build_object('basis_cost_cents', v_basis_cost, 'band_add_cents', v_w_add, 'floor_cents', v_floor_wholesale)
      where not exists (
        select 1 from public.pricing_flags
        where variant_id = v_variant_id and tier = 'wholesale'::public.customer_tier
          and kind = 'margin'::public.pricing_flag_kind and status = 'open'::public.pricing_flag_status
      );
    else
      update public.pricing_flags
         set status = 'resolved'::public.pricing_flag_status, resolved_at = now()
       where variant_id = v_variant_id and tier = 'wholesale'::public.customer_tier
         and kind = 'margin'::public.pricing_flag_kind and status = 'open'::public.pricing_flag_status;
    end if;

    ----------------------------------------------------------------
    -- T4 Distributor — same shape as T3.
    ----------------------------------------------------------------
    v_d_add := public.omp_band_add(v_basis_cost, v_distributor_bands, v_distributor_pct_cap, v_premium_threshold);
    if v_d_add < v_floor_distributor then
      v_d_price   := 1;
      v_d_visible := false;
      v_d_flag    := 'margin';
    else
      v_d_price   := v_basis_cost + v_d_add;
      v_d_visible := true;
      v_d_flag    := null;
    end if;

    if v_d_flag = 'margin' then
      insert into public.pricing_flags (variant_id, tier, kind, payload)
      select v_variant_id, 'distributor'::public.customer_tier, 'margin'::public.pricing_flag_kind,
             jsonb_build_object('basis_cost_cents', v_basis_cost, 'band_add_cents', v_d_add, 'floor_cents', v_floor_distributor)
      where not exists (
        select 1 from public.pricing_flags
        where variant_id = v_variant_id and tier = 'distributor'::public.customer_tier
          and kind = 'margin'::public.pricing_flag_kind and status = 'open'::public.pricing_flag_status
      );
    else
      update public.pricing_flags
         set status = 'resolved'::public.pricing_flag_status, resolved_at = now()
       where variant_id = v_variant_id and tier = 'distributor'::public.customer_tier
         and kind = 'margin'::public.pricing_flag_kind and status = 'open'::public.pricing_flag_status;
    end if;

    ----------------------------------------------------------------
    -- T1 Consumer / T2 Retailer. The engine NEVER invents a consumer price
    -- (DECISIONS-LOCKED.md #1 "no invented pricing") — T1 only comes from
    -- an admin/comps-spreadsheet-authored row already sitting in `prices`
    -- with source in ('benchmark','manual'). No such row -> T1/T2 stay
    -- hidden with flag_reason 'unbenchmarked', never a guessed number.
    ----------------------------------------------------------------
    v_consumer_eligible := v_ctia in ('NEW'::public.ctia_grade, 'CPO'::public.ctia_grade, 'A'::public.ctia_grade);

    if not v_consumer_eligible then
      -- Grade gate (PRICING-ENGINE.md §2/§6 "Grade gate is absolute").
      -- Not a pricing_flags kind: this is expected, permanent gating by
      -- design, not an anomaly that needs admin review — pricing_flag_kind
      -- has no 'grade_gate' member, and it should not gain one just for
      -- this. Any stale margin/unbenchmarked flags on these tiers (e.g. the
      -- variant used to be grade A and is now regraded) are still cleared
      -- below.
      v_consumer_price   := 1;
      v_consumer_visible := false;
      v_consumer_flag    := 'grade_gate';
      v_retailer_price   := 1;
      v_retailer_visible := false;
      v_retailer_flag    := 'grade_gate';
    else
      select price_cents, source
        into v_existing_consumer_price, v_existing_consumer_source
      from public.prices
      where variant_id = v_variant_id and tier = 'consumer'::public.customer_tier
        and source in ('benchmark', 'manual');

      if v_existing_consumer_price is null then
        v_consumer_price   := 1;
        v_consumer_visible := false;
        v_consumer_flag    := 'unbenchmarked';
        v_retailer_price   := 1;
        v_retailer_visible := false;
        v_retailer_flag    := 'unbenchmarked';
      elsif v_existing_consumer_price - v_t12_basis < v_floor_consumer then
        -- Consumer floor violation: keep the admin's real authored number
        -- (never overwrite it with a sentinel), just hide it. Retailer
        -- cascades hidden too — reference pricing_engine.py line 283.
        v_consumer_price   := v_existing_consumer_price;
        v_consumer_visible := false;
        v_consumer_flag    := 'margin';
        v_retailer_price   := 1;
        v_retailer_visible := false;
        v_retailer_flag    := 'margin';
      else
        v_consumer_price   := v_existing_consumer_price;
        v_consumer_visible := true;
        v_consumer_flag    := null;

        v_retailer_price := v_existing_consumer_price - v_retailer_min_margin;
        if v_retailer_price - v_t12_basis < v_floor_retailer then
          v_retailer_visible := false;
          v_retailer_flag    := 'margin';
        else
          v_retailer_visible := true;
          v_retailer_flag    := null;
        end if;
      end if;
    end if;

    -- Consumer flags-table bookkeeping: resolve whichever kind no longer
    -- applies, insert-if-not-open the kind that currently does. grade_gate
    -- has no matching kind, so both resolve and nothing is (re)inserted.
    update public.pricing_flags
       set status = 'resolved'::public.pricing_flag_status, resolved_at = now()
     where variant_id = v_variant_id and tier = 'consumer'::public.customer_tier
       and kind in ('margin'::public.pricing_flag_kind, 'unbenchmarked'::public.pricing_flag_kind)
       and status = 'open'::public.pricing_flag_status
       and kind is distinct from (case v_consumer_flag
             when 'margin' then 'margin'::public.pricing_flag_kind
             when 'unbenchmarked' then 'unbenchmarked'::public.pricing_flag_kind
             else null end);

    if v_consumer_flag in ('margin', 'unbenchmarked') then
      insert into public.pricing_flags (variant_id, tier, kind, payload)
      select v_variant_id, 'consumer'::public.customer_tier, v_consumer_flag::public.pricing_flag_kind,
             jsonb_build_object('t12_basis_cents', v_t12_basis, 'price_cents', v_consumer_price, 'floor_cents', v_floor_consumer)
      where not exists (
        select 1 from public.pricing_flags
        where variant_id = v_variant_id and tier = 'consumer'::public.customer_tier
          and kind = v_consumer_flag::public.pricing_flag_kind and status = 'open'::public.pricing_flag_status
      );
    end if;

    -- Retailer flags-table bookkeeping — same shape.
    update public.pricing_flags
       set status = 'resolved'::public.pricing_flag_status, resolved_at = now()
     where variant_id = v_variant_id and tier = 'retailer'::public.customer_tier
       and kind in ('margin'::public.pricing_flag_kind, 'unbenchmarked'::public.pricing_flag_kind)
       and status = 'open'::public.pricing_flag_status
       and kind is distinct from (case v_retailer_flag
             when 'margin' then 'margin'::public.pricing_flag_kind
             when 'unbenchmarked' then 'unbenchmarked'::public.pricing_flag_kind
             else null end);

    if v_retailer_flag in ('margin', 'unbenchmarked') then
      insert into public.pricing_flags (variant_id, tier, kind, payload)
      select v_variant_id, 'retailer'::public.customer_tier, v_retailer_flag::public.pricing_flag_kind,
             jsonb_build_object('t12_basis_cents', v_t12_basis, 'price_cents', v_retailer_price, 'floor_cents', v_floor_retailer)
      where not exists (
        select 1 from public.pricing_flags
        where variant_id = v_variant_id and tier = 'retailer'::public.customer_tier
          and kind = v_retailer_flag::public.pricing_flag_kind and status = 'open'::public.pricing_flag_status
      );
    end if;

    ----------------------------------------------------------------
    -- Tier-order invariant across VISIBLE tiers only: cost < T4 < T3 < T2 <
    -- T1, strict (PRICING-ENGINE.md §6 — the reference's `chain !=
    -- sorted(chain)` also rejects ties, since Python sort is stable and a
    -- duplicate value keeps chain unchanged only if already sorted, but a
    -- tie elsewhere still fails equality against a strictly-deduped
    -- expectation in practice; we make it explicit here with `>=`).
    -- Violation -> hide every tier that was about to be visible and route
    -- to admin (never publish), per §4 step 8 and §6.
    ----------------------------------------------------------------
    v_chain := array[v_basis_cost];
    if v_d_visible then v_chain := v_chain || v_d_price; end if;
    if v_w_visible then v_chain := v_chain || v_w_price; end if;
    if v_retailer_visible then v_chain := v_chain || v_retailer_price; end if;
    if v_consumer_visible then v_chain := v_chain || v_consumer_price; end if;

    v_violation := false;
    for v_i in 1 .. array_length(v_chain, 1) - 1 loop
      if v_chain[v_i] >= v_chain[v_i + 1] then
        v_violation := true;
      end if;
    end loop;

    if v_violation then
      if v_d_visible then v_d_visible := false; v_d_flag := 'tier_order'; end if;
      if v_w_visible then v_w_visible := false; v_w_flag := 'tier_order'; end if;
      if v_retailer_visible then v_retailer_visible := false; v_retailer_flag := 'tier_order'; end if;
      if v_consumer_visible then v_consumer_visible := false; v_consumer_flag := 'tier_order'; end if;

      insert into public.pricing_flags (variant_id, tier, kind, payload)
      select v_variant_id, null, 'tier_order'::public.pricing_flag_kind,
             jsonb_build_object(
               'cost_cents', v_basis_cost, 'distributor_cents', v_d_price, 'wholesale_cents', v_w_price,
               'retailer_cents', v_retailer_price, 'consumer_cents', v_consumer_price)
      where not exists (
        select 1 from public.pricing_flags
        where variant_id = v_variant_id and tier is null
          and kind = 'tier_order'::public.pricing_flag_kind and status = 'open'::public.pricing_flag_status
      );
    else
      update public.pricing_flags
         set status = 'resolved'::public.pricing_flag_status, resolved_at = now()
       where variant_id = v_variant_id and tier is null
         and kind = 'tier_order'::public.pricing_flag_kind and status = 'open'::public.pricing_flag_status;
    end if;

    ----------------------------------------------------------------
    -- Persist. T3/T4/T2 are always engine-authored (source='engine'). T1 is
    -- engine-authored only when there was no benchmark/manual row to begin
    -- with; otherwise we UPDATE the existing row's status columns and leave
    -- price_cents/source untouched — the admin's number is never
    -- overwritten by this function.
    ----------------------------------------------------------------
    insert into public.prices (variant_id, tier, price_cents, visible, flag_reason, basis_cost_cents, source, computed_at)
    values (v_variant_id, 'wholesale'::public.customer_tier, v_w_price, v_w_visible, v_w_flag, v_basis_cost, 'engine', now())
    on conflict (variant_id, tier) do update
      set price_cents = excluded.price_cents, visible = excluded.visible, flag_reason = excluded.flag_reason,
          basis_cost_cents = excluded.basis_cost_cents, source = excluded.source, computed_at = excluded.computed_at;

    insert into public.prices (variant_id, tier, price_cents, visible, flag_reason, basis_cost_cents, source, computed_at)
    values (v_variant_id, 'distributor'::public.customer_tier, v_d_price, v_d_visible, v_d_flag, v_basis_cost, 'engine', now())
    on conflict (variant_id, tier) do update
      set price_cents = excluded.price_cents, visible = excluded.visible, flag_reason = excluded.flag_reason,
          basis_cost_cents = excluded.basis_cost_cents, source = excluded.source, computed_at = excluded.computed_at;

    insert into public.prices (variant_id, tier, price_cents, visible, flag_reason, basis_cost_cents, source, computed_at)
    values (v_variant_id, 'retailer'::public.customer_tier, v_retailer_price, v_retailer_visible, v_retailer_flag, v_t12_basis, 'engine', now())
    on conflict (variant_id, tier) do update
      set price_cents = excluded.price_cents, visible = excluded.visible, flag_reason = excluded.flag_reason,
          basis_cost_cents = excluded.basis_cost_cents, source = excluded.source, computed_at = excluded.computed_at;

    if v_existing_consumer_price is not null then
      update public.prices
         set visible = v_consumer_visible, flag_reason = v_consumer_flag,
             basis_cost_cents = v_t12_basis, computed_at = now()
       where variant_id = v_variant_id and tier = 'consumer'::public.customer_tier;
    else
      insert into public.prices as pr (variant_id, tier, price_cents, visible, flag_reason, basis_cost_cents, source, computed_at)
      values (v_variant_id, 'consumer'::public.customer_tier, v_consumer_price, v_consumer_visible, v_consumer_flag, v_t12_basis, 'engine', now())
      on conflict (variant_id, tier) do update
        set visible = excluded.visible, flag_reason = excluded.flag_reason,
            basis_cost_cents = excluded.basis_cost_cents, computed_at = excluded.computed_at
        -- Guard is "not admin-authored", not "= engine": prices.source
        -- defaults to 'import' (schema default, unused by any writer today)
        -- and nothing but this function and a future Phase 3 admin/comps
        -- writer ever populates this row, so anything other than
        -- benchmark/manual is fair game for the engine to reclaim. A
        -- narrower `= 'engine'` guard would silently no-op forever against
        -- a row that slipped in with the bare column default.
        where pr.source not in ('benchmark', 'manual');
    end if;

  end loop;
end;
$$;

comment on function public.reprice_variants(uuid[]) is
  'The pricing waterfall (PRICING-ENGINE.md §4) for a batch of variant ids. SECURITY DEFINER, no admin/staff gate — internal engine entry point, called by a postgres-owned caller (the future commit_stock_import reprice hook), never directly by authenticated/anon. NOT called by this migration; the orchestrator wires the call site separately.';

revoke execute on function public.reprice_variants(uuid[]) from public, anon, authenticated;

------------------------------------------------------------------
-- C. Customer-facing price resolution — view + convenience function.
-- Same "NOT security_invoker" shape as the five masking views in
-- 20260806120300 (plain CREATE VIEW, owner rights, explicit column list) —
-- see that migration's Section C comment for the full rationale. The
-- Supabase security advisor will flag this as security_definer_view and
-- suggest security_invoker = true; DO NOT apply that suggestion. This view
-- has no SELECT policy for customers on the base table to fall back to (see
-- Section D below, which drops the one that existed) — an invoker-rights
-- view would return ZERO ROWS for every customer, presenting as "no prices
-- ever load" rather than as a security alert.
--
-- Tier resolution is entirely server-side: current_customer_tier() (defined
-- in 20260806120000) is SECURITY DEFINER and reads profiles.tier by
-- auth.uid() from the verified JWT — no URL parameter, request body or
-- cookie can influence which tier's price comes back.
------------------------------------------------------------------
create view public.variant_price_for_me as
  select p.variant_id, p.price_cents
  from public.prices p
  where p.visible
    and p.tier = (select public.current_customer_tier());

comment on view public.variant_price_for_me is
  'Customer-facing price resolution, one row per variant at the CALLER''s own tier. Intentionally NOT security_invoker — see 20260806120300''s Section C rationale: adding security_invoker = true makes this return ZERO rows for every customer (no base-table SELECT policy backs it), which presents as "prices never load" rather than a security alert. Exposes price_cents only — never basis_cost_cents, flag_reason or source, which would leak OMP''s cost/margin structure to a signed-in customer.';

grant select on public.variant_price_for_me to authenticated;
-- No anon grant: current_customer_tier() returns null for an unauthenticated
-- session (auth.uid() is null), which already yields zero rows, but prices
-- is sensitive-by-default unlike the five public catalog views, so anon gets
-- no surface here at all rather than relying on that null-safety alone.

create or replace function public.my_visible_price(p_variant_id uuid)
returns bigint
language sql
stable
set search_path = ''
as $$
  select price_cents from public.variant_price_for_me where variant_id = p_variant_id
$$;

comment on function public.my_visible_price(uuid) is
  'Single-variant convenience wrapper over variant_price_for_me (e.g. product detail / cart line lookups). Plain SQL, invoker rights — it only ever touches the view above, never the base prices table, so it needs no elevated privilege of its own.';

revoke execute on function public.my_visible_price(uuid) from public, anon, authenticated;
grant execute on function public.my_visible_price(uuid) to authenticated;

------------------------------------------------------------------
-- D. RLS fix — close the cost leak in the scaffold's customer policy.
--
-- 20260806120400 added "prices own tier read": `visible and tier =
-- current_customer_tier()`. Postgres RLS is row-level only (no per-column
-- policies), so that policy hands a matching-tier customer every column on
-- every visible row it allows through — including basis_cost_cents, which
-- is cost-derived and the same sensitivity class as unit_cost_cents
-- (DATA-CLASSIFICATION.md), plus flag_reason and source, which expose the
-- engine's internal reasoning. The task's own requirement is "customers
-- read ONLY their own tier's visible price via the view (no direct
-- base-table customer policy that leaks cost)" — this policy violated that
-- from the moment it was written.
--
-- Verified before dropping: `grep -rn "from('prices')" apps/web/src` finds
-- no hits (2026-08-07) — nothing in the frontend queries `prices` directly
-- yet (the storefront/Phase 4 catalog isn't built), so there is no shipped
-- code depending on this policy. Customer access now goes exclusively
-- through variant_price_for_me / my_visible_price (Section C), which expose
-- price_cents only.
------------------------------------------------------------------
drop policy if exists "prices own tier read" on public.prices;

comment on table public.prices is
  'Consolidated per variant (not per location) — SMART-STOCK-IMPORT.md v1 rule computes from the highest cost among in-stock locations, so one price per (variant, tier). Customer reads go through public.variant_price_for_me / public.my_visible_price ONLY — there is no customer SELECT policy on this base table (dropped 20260807150000; the original scaffold policy leaked basis_cost_cents/flag_reason/source to any customer at a matching tier, since RLS has no column granularity).';

------------------------------------------------------------------
-- E. Self-verification seed — re-asserts the reference floors on tiers
-- (idempotent, matches 20260806120400 exactly; a no-op if that migration
-- already applied). Deliberately does NOT re-seed pricing_settings or add
-- any new key: every value this migration's waterfall needs
-- (wholesale_bands, distributor_bands, wholesale_pct_cap, distributor_pct_cap,
-- premium_cost_threshold_cents, kit_cost_premium_cents, kit_cost_standard_cents,
-- kit_premium_threshold_cents, retailer_min_margin_cents,
-- cost_change_review_pct) already exists with those exact names and values
-- from 20260806120400. Three deliberate departures from the task's literal
-- key list, recorded here rather than silently:
--   * floor_consumer_cents / floor_retailer_cents / floor_wholesale_cents /
--     floor_distributor_cents are NOT added to pricing_settings — floors
--     already live on tiers.floor_cents, and 20260806120400's own comment
--     says why duplicating them would create a second source of truth.
--   * kit_premium_cents / kit_standard_cents (as literally named in the
--     task) are NOT added alongside the existing kit_cost_premium_cents /
--     kit_cost_standard_cents — a second pair of keys naming the same
--     config would give a future Phase 7 admin panel a set of keys the
--     engine silently ignores.
--   * cross_location_spread_threshold_pct is NOT seeded with 0.15.
--     SMART-STOCK-IMPORT.md calls the cross-location spread threshold
--     "configurable" with no figure anywhere in the reference CONFIG or the
--     ADR, and 20260806120400's comment already declined to invent one,
--     citing DECISIONS-LOCKED.md #1 "no invented pricing". This migration
--     does not implement the 'spread' pricing_flags kind for the same
--     reason: a branch gated on a setting nobody has ever set is dead code
--     until Phase 7 supplies a real number. Tracked as a Phase 7 input the
--     user must supply, not invented here.
------------------------------------------------------------------
insert into public.tiers (code, label, min_units, max_units, floor_cents, position) values
  ('consumer',    'Consumer',    1,   9,    1000, 1),
  ('retailer',    'Retailer',    10,  49,   500,  2),
  ('wholesale',   'Wholesale',   50,  399,  250,  3),
  ('distributor', 'Distributor', 400, null, 100,  4)
on conflict (code) do update set
  label = excluded.label,
  min_units = excluded.min_units,
  max_units = excluded.max_units,
  floor_cents = excluded.floor_cents,
  position = excluded.position;
