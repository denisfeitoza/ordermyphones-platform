-- 20260807170000_admin_pricing_rpcs.sql
-- Admin Pricing UI write path (docs/architecture/PRICING-ENGINE.md §5, admin
-- flag queue). public.reprice_variants (20260807150000) is the only place
-- the waterfall actually runs, and it revokes EXECUTE from
-- public/anon/authenticated on purpose — a signed-in customer must never be
-- able to trigger a full repricing pass directly via PostgREST. The two
-- RPCs below are the admin-facing front door onto that engine: both are
-- SECURITY DEFINER (owned by postgres, same as every other helper in this
-- phase), gate on is_admin_or_staff() as their FIRST statement, and call
-- reprice_variants internally — which works with zero additional grants,
-- same mechanism commit_stock_import already relies on (20260807160000).
--
-- AUTHORED ONLY — NOT applied by this session. The orchestrator applies it
-- (per the task brief for the admin Pricing UI build).
--
-- Style convention (unchanged): `set search_path = ''`, fully schema-
-- qualified bodies, enum literals cast explicitly, `revoke ... from public,
-- anon; grant ... to authenticated` (never grant to anon).

------------------------------------------------------------------
-- A. public.set_consumer_benchmark — admin sets/updates the T1 (consumer)
-- benchmark price for one variant, then reprices it.
--
-- Visibility subtlety (read before touching this function): reprice_variants
-- only reaches the "read existing benchmark/manual row, decide visible from
-- the margin floor" branch when the variant is CTIA consumer-eligible
-- (NEW/CPO/A). For a grade-gated (sub-A) variant, that branch is skipped
-- entirely and the persist step's ON CONFLICT DO UPDATE guard
-- (`where pr.source not in ('benchmark','manual')`) means a row already
-- carrying source='benchmark' is left EXACTLY as this function wrote it —
-- reprice_variants will NOT force it back to hidden on a grade-gated SKU.
-- The only safe way to honor PRICING-ENGINE.md §6 "grade gate is absolute"
-- from this side of that guard is for THIS function to never write
-- visible=true itself: every upsert below writes visible=false
-- unconditionally, and only the eligible-branch UPDATE inside
-- reprice_variants (which this function calls immediately after) is ever
-- allowed to flip it true. Do not "simplify" this by setting visible=true
-- here for a fast UI — that would leak a sub-A grade price to consumer/
-- retailer the moment it clears its margin floor with no grade check at all.
------------------------------------------------------------------
create or replace function public.set_consumer_benchmark(
  p_variant_id uuid,
  p_price_cents bigint
)
returns setof public.prices
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_admin_or_staff()) then
    raise exception 'not authorized';
  end if;

  if p_price_cents is null or p_price_cents <= 0 then
    raise exception 'p_price_cents must be a positive integer number of cents';
  end if;

  if not exists (select 1 from public.product_variants where id = p_variant_id) then
    raise exception 'unknown variant_id %', p_variant_id;
  end if;

  -- visible is always written false here — see header comment. Any prior
  -- flag_reason is cleared since the number itself just changed; reprice
  -- below recomputes the real one (margin / unbenchmarked / grade_gate /
  -- tier_order / null) from scratch.
  insert into public.prices (variant_id, tier, price_cents, visible, flag_reason, source, computed_at)
  values (p_variant_id, 'consumer'::public.customer_tier, p_price_cents, false, null, 'benchmark', now())
  on conflict (variant_id, tier) do update
    set price_cents = excluded.price_cents,
        source       = 'benchmark',
        visible      = false,
        flag_reason  = null,
        computed_at  = now();

  perform public.reprice_variants(array[p_variant_id]);

  return query
    select * from public.prices where variant_id = p_variant_id order by tier;
end;
$$;

comment on function public.set_consumer_benchmark(uuid, bigint) is
  'Admin/staff-only front door onto the pricing waterfall (PRICING-ENGINE.md §5): upserts the T1 consumer benchmark price (source=''benchmark'', always written visible=false — see function body comment for why) then runs reprice_variants for that one variant, which derives T2 from it and recomputes every flag. Returns the four (or fewer) resulting prices rows for the variant so the caller can render the live result without a second round trip.';

revoke execute on function public.set_consumer_benchmark(uuid, bigint) from public, anon;
grant execute on function public.set_consumer_benchmark(uuid, bigint) to authenticated;

------------------------------------------------------------------
-- B. public.resolve_pricing_flag — the three admin flag-queue actions
-- (PRICING-ENGINE.md §5: Override / Acknowledge / Watch) plus a plain
-- Resolve for flags that need no price change (e.g. an admin has verified a
-- zero_qty or tier_order flag by other means).
--
-- 'override' is scoped to per-tier flags only (tier is not null) — a
-- zero_qty or tier_order flag has tier = null because it can affect every
-- tier of a variant at once (PRICING-ENGINE.md §6), and "override with one
-- price" has no well-defined target in that case. Acknowledge/Watch/Resolve
-- have no such restriction; they only ever touch pricing_flags, never
-- prices.
--
-- Grade gate applies to override too (PRICING-ENGINE.md §6: "no matter what
-- a benchmark OR OVERRIDE says"). When the target tier is consumer or
-- retailer, this function re-derives the variant's CTIA grade with the same
-- vendor_grade_map lookup reprice_variants uses (unmapped -> CTIA C, the
-- same safe default) and refuses to publish a visible override on a sub-A
-- (non NEW/CPO/A) variant. There is no currently-reachable path to an open
-- per-tier consumer/retailer flag on a grade-gated SKU (reprice_variants'
-- own bookkeeping resolves margin/unbenchmarked on those tiers rather than
-- leaving them open once grade_gate applies), but cost_swing/spread/
-- collision exist in the enum with no writer yet, and "no matter what" in
-- the doc means this function must not be the hole that proves it wrong.
--
-- Known limitation, not fixed here (out of this migration's scope — it
-- would mean editing reprice_variants, which the orchestrator owns):
-- PRICING-ENGINE.md §5 describes Watch as "auto-reprice nightly; the night
-- the benchmark clears the floor, the SKU un-flags... with no human touch."
-- reprice_variants' own flag bookkeeping only auto-resolves flags currently
-- in status='open' (`... and status = 'open'::public.pricing_flag_status`);
-- a flag this function moves to 'watching' will NOT be picked back up and
-- auto-resolved by a later reprice pass under the engine as it stands
-- today. This function still sets status='watching' faithfully per the
-- enum/spec — the gap is upstream in reprice_variants, not something a
-- resolve-side RPC can close.
------------------------------------------------------------------
create or replace function public.resolve_pricing_flag(
  p_flag_id uuid,
  p_action text,
  p_override_price_cents bigint default null,
  p_expiry_days int default 30
)
returns setof public.pricing_flags
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_variant_id uuid;
  v_tier       public.customer_tier;
  v_grade      text;
  v_ctia       public.ctia_grade;
begin
  if not (select public.is_admin_or_staff()) then
    raise exception 'not authorized';
  end if;

  -- `NULL not in (...)` evaluates to NULL (not true), so a null p_action
  -- would otherwise fall through every `elsif =` comparison below (all
  -- NULL-typed, all false) into the bare `else` branch and silently
  -- resolve the flag. Reject null explicitly.
  if p_action is null or p_action not in ('override', 'acknowledge', 'watch', 'resolve') then
    raise exception 'invalid p_action %, expected one of override|acknowledge|watch|resolve', p_action;
  end if;

  select variant_id, tier into v_variant_id, v_tier
  from public.pricing_flags
  where id = p_flag_id;

  if v_variant_id is null then
    raise exception 'unknown flag_id %', p_flag_id;
  end if;

  if p_action = 'override' then
    if v_tier is null then
      raise exception 'flag % has no single tier (its kind affects every tier at once) — override requires a per-tier flag', p_flag_id;
    end if;
    if p_override_price_cents is null or p_override_price_cents <= 0 then
      raise exception 'override requires a positive p_override_price_cents';
    end if;
    if p_expiry_days is null or p_expiry_days <= 0 then
      raise exception 'p_expiry_days must be a positive integer';
    end if;

    if v_tier in ('consumer'::public.customer_tier, 'retailer'::public.customer_tier) then
      -- Same lookup as reprice_variants (20260807150000): worst-match-wins
      -- (`order by ctia desc`), unmapped grade defaults to CTIA C. Mirrors
      -- the engine's own "when in doubt, gate it out" rule rather than
      -- inventing a second, possibly-drifting classification here.
      select pv.grade into v_grade
      from public.product_variants pv
      where pv.id = v_variant_id;

      select vgm.ctia into v_ctia
      from public.vendor_grade_map vgm
      where upper(trim(vgm.vendor_grade)) = upper(trim(v_grade))
      order by vgm.ctia desc
      limit 1;

      if v_ctia is null then
        v_ctia := 'C'::public.ctia_grade;
      end if;

      if v_ctia not in ('NEW'::public.ctia_grade, 'CPO'::public.ctia_grade, 'A'::public.ctia_grade) then
        raise exception 'variant % is grade-gated (CTIA %) — consumer/retailer cannot be overridden visible', v_variant_id, v_ctia;
      end if;
    end if;

    update public.pricing_flags
       set status                = 'overridden'::public.pricing_flag_status,
           override_price_cents  = p_override_price_cents,
           override_expires_at   = now() + (p_expiry_days * interval '1 day'),
           actor_id              = auth.uid(),
           resolved_at           = now()
     where id = p_flag_id;

    insert into public.prices (variant_id, tier, price_cents, visible, flag_reason, source, computed_at)
    values (v_variant_id, v_tier, p_override_price_cents, true, null, 'override', now())
    on conflict (variant_id, tier) do update
      set price_cents = excluded.price_cents,
          visible      = true,
          flag_reason  = null,
          source       = 'override',
          computed_at  = now();

  elsif p_action = 'acknowledge' then
    update public.pricing_flags
       set status      = 'acknowledged'::public.pricing_flag_status,
           actor_id    = auth.uid(),
           resolved_at = now()
     where id = p_flag_id;

  elsif p_action = 'watch' then
    -- Not resolved yet — deliberately no resolved_at (see header comment on
    -- the un-auto-resolve gap: this stays 'watching' until an admin acts
    -- again, not until a nightly reprice notices).
    update public.pricing_flags
       set status   = 'watching'::public.pricing_flag_status,
           actor_id = auth.uid()
     where id = p_flag_id;

  else -- 'resolve'
    update public.pricing_flags
       set status      = 'resolved'::public.pricing_flag_status,
           actor_id    = auth.uid(),
           resolved_at = now()
     where id = p_flag_id;
  end if;

  return query select * from public.pricing_flags where id = p_flag_id;
end;
$$;

comment on function public.resolve_pricing_flag(uuid, text, bigint, int) is
  'Admin/staff-only flag-queue actions (PRICING-ENGINE.md §5). override (per-tier flags only) writes a 30-day-default-expiry override onto pricing_flags AND publishes the price (source=''override'', visible=true) in one transaction; acknowledge/watch/resolve only ever touch pricing_flags.status, never prices. Every action stamps actor_id=auth.uid() for audit. Returns the updated pricing_flags row.';

revoke execute on function public.resolve_pricing_flag(uuid, text, bigint, int) from public, anon;
grant execute on function public.resolve_pricing_flag(uuid, text, bigint, int) to authenticated;
