-- Audit 2026-09-13 P2 leftovers (database side).
--
-- A. approve_order / resolve_reconciliation never deduct from an INACTIVE
--    stock location (catalog_listing already hides inactive stock, so a
--    customer could never have been promised it).
-- B. stock_locations writes become admin-only (the active switch decides
--    which warehouse ships; staff keep read). Import auto-creates locations
--    through the SECURITY DEFINER commit_stock_import, unaffected.
-- C. Duplicate permissive SELECT policies: every "FOR ALL" write policy that
--    overlapped a SELECT policy is split into INSERT / UPDATE / DELETE with
--    the exact same predicate. Access is unchanged: for every table except
--    invites the SELECT policy already admits everyone the write policy did
--    (same predicate, `true`, or staff ⊇ admin); for invites the admin branch
--    is ORed into the SELECT policy.

------------------------------------------------------------------
-- A. order RPCs skip inactive locations
------------------------------------------------------------------

create or replace function public.approve_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid            uuid := auth.uid();
  v_order          public.orders;
  v_item           public.order_items;
  v_loc            record;
  v_remaining      integer;
  v_deducted_total integer;
  v_take           integer;
  v_primary_loc    uuid;
  v_recon_loc      uuid;
  v_any_short      boolean := false;
  v_approved_lines integer := 0;
  v_short_lines    integer := 0;
  v_recon_ids      uuid[] := '{}';
  v_recon_id       uuid;
  v_fmode          text;
begin
  if not public.is_admin_or_staff() then
    raise exception 'staff_only' using errcode = '42501';
  end if;

  select coalesce(value->>'mode', 'fallback') into v_fmode
    from public.app_settings where key = 'order_location_fulfillment';
  v_fmode := coalesce(v_fmode, 'fallback');

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  if v_order.status <> 'pending' then
    raise exception 'order_not_pending' using errcode = 'P0001', detail = v_order.status::text;
  end if;

  -- Lock this order's inventory rows up front in deterministic order so
  -- concurrent approvals sharing a variant serialize here (unchanged: keyed by
  -- variant_id, so multiple location-lines of the same variant lock the same
  -- rows).
  perform 1
    from public.inventory inv
   where inv.variant_id in (select oi.variant_id from public.order_items oi where oi.order_id = p_order_id)
   order by inv.variant_id, inv.location_id
     for update;

  for v_item in
    select * from public.order_items where order_id = p_order_id order by id
  loop
    v_remaining      := v_item.qty_requested;
    v_deducted_total := 0;
    v_primary_loc    := null;

    -- Unified draw order across the three cases:
    --   requested NULL           -> all locations, fullest-first (v1)
    --   requested + fallback     -> requested location first, then others fullest-first
    --   requested + strict       -> requested location only
    for v_loc in
      select inv.location_id, inv.qty
        from public.inventory inv
       where inv.variant_id = v_item.variant_id
         and inv.qty > 0
         and exists (select 1 from public.stock_locations sl
                      where sl.id = inv.location_id and sl.active)
         and (
           v_item.requested_location_id is null
           or v_fmode = 'fallback'
           or inv.location_id = v_item.requested_location_id
         )
       order by (inv.location_id = v_item.requested_location_id) desc nulls last,
                inv.qty desc, inv.location_id
    loop
      exit when v_remaining <= 0;
      v_take := least(v_remaining, v_loc.qty);
      if v_take > 0 then
        insert into public.stock_movements (variant_id, location_id, delta, reason,
                                             ref_type, ref_id, actor_id, note)
        values (v_item.variant_id, v_loc.location_id, -v_take, 'order_approval',
                'orders', p_order_id, v_uid, 'order approval');
        v_remaining      := v_remaining - v_take;
        v_deducted_total := v_deducted_total + v_take;
        if v_primary_loc is null then v_primary_loc := v_loc.location_id; end if;
      end if;
    end loop;

    update public.order_items
       set qty_approved = v_deducted_total,
           location_id  = v_primary_loc
     where id = v_item.id;

    if v_deducted_total > 0 then
      v_approved_lines := v_approved_lines + 1;
    end if;

    if v_remaining > 0 then
      v_any_short   := true;
      v_short_lines := v_short_lines + 1;
      -- Bind the shortfall to the requested location when the customer chose
      -- one, else the primary deducted (v1). Gives reconciliation a single,
      -- unambiguous location to prefer when fulfilling later.
      v_recon_loc := coalesce(v_item.requested_location_id, v_primary_loc);
      insert into public.reconciliation_queue (order_item_id, variant_id, location_id, shortfall_qty, note)
      values (v_item.id, v_item.variant_id, v_recon_loc, v_remaining, 'approval shortfall')
      returning id into v_recon_id;
      v_recon_ids := array_append(v_recon_ids, v_recon_id);
    end if;
  end loop;

  update public.orders
     set status     = case when v_any_short then 'partially_approved'::public.order_status
                           else 'approved'::public.order_status end,
         decided_at = now(),
         decided_by = v_uid
   where id = p_order_id
  returning * into v_order;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, payload)
  values (v_uid, 'order_approved', 'orders', p_order_id,
          jsonb_build_object('status', v_order.status,
                             'approved_lines', v_approved_lines,
                             'short_lines', v_short_lines,
                             'fulfillment', v_fmode,
                             'reconciliation_ids', to_jsonb(v_recon_ids)));

  return jsonb_build_object(
    'order_id',            p_order_id,
    'status',              v_order.status,
    'approved_lines',      v_approved_lines,
    'short_lines',         v_short_lines,
    'reconciliation_ids',  to_jsonb(v_recon_ids)
  );
end;
$$;

create or replace function public.resolve_reconciliation(p_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_row       public.reconciliation_queue;
  v_item      public.order_items;
  v_order_id  uuid;
  v_loc       record;
  v_remaining integer := 0;
  v_deducted  integer := 0;
  v_take      integer;
  v_open_left integer;
  v_all_full  boolean;
begin
  if not public.is_admin_or_staff() then
    raise exception 'staff_only' using errcode = '42501';
  end if;
  if p_action not in ('fulfill', 'cancel') then
    raise exception 'bad_action' using errcode = 'P0001';
  end if;

  select * into v_row from public.reconciliation_queue where id = p_id for update;
  if not found then
    raise exception 'reconciliation_not_found' using errcode = 'P0001';
  end if;
  if v_row.status <> 'open' then
    raise exception 'reconciliation_not_open' using errcode = 'P0001';
  end if;

  select * into v_item from public.order_items where id = v_row.order_item_id;
  v_order_id := v_item.order_id;

  if p_action = 'cancel' then
    update public.reconciliation_queue
       set status = 'cancelled', resolved_at = now(), resolved_by = v_uid
     where id = p_id;

    insert into public.audit_log (actor_id, action, entity_type, entity_id, payload)
    values (v_uid, 'reconciliation_cancelled', 'reconciliation_queue', p_id,
            jsonb_build_object('order_id', v_order_id, 'shortfall_qty', v_row.shortfall_qty));
  else
    perform 1 from public.inventory inv
      where inv.variant_id = v_item.variant_id
      order by inv.location_id
        for update;

    v_remaining := v_row.shortfall_qty;
    -- Prefer the bound location (v_row.location_id) first, then fullest-first
    -- anywhere — a shortfall clears with whatever stock has since arrived.
    for v_loc in
      select inv.location_id, inv.qty
        from public.inventory inv
       where inv.variant_id = v_item.variant_id and inv.qty > 0
         and exists (select 1 from public.stock_locations sl
                      where sl.id = inv.location_id and sl.active)
       order by (inv.location_id = v_row.location_id) desc nulls last,
                inv.qty desc, inv.location_id
    loop
      exit when v_remaining <= 0;
      v_take := least(v_remaining, v_loc.qty);
      if v_take > 0 then
        insert into public.stock_movements (variant_id, location_id, delta, reason,
                                            ref_type, ref_id, actor_id, note)
        values (v_item.variant_id, v_loc.location_id, -v_take, 'order_approval',
                'orders', v_order_id, v_uid, 'reconciliation fulfill');
        v_remaining := v_remaining - v_take;
        v_deducted  := v_deducted + v_take;
      end if;
    end loop;

    if v_deducted > 0 then
      update public.order_items
         set qty_approved = coalesce(qty_approved, 0) + v_deducted
       where id = v_item.id;
    end if;

    if v_remaining <= 0 then
      update public.reconciliation_queue
         set status = 'resolved', resolved_at = now(), resolved_by = v_uid
       where id = p_id;
    else
      update public.reconciliation_queue set shortfall_qty = v_remaining where id = p_id;
    end if;

    insert into public.audit_log (actor_id, action, entity_type, entity_id, payload)
    values (v_uid, 'reconciliation_fulfilled', 'reconciliation_queue', p_id,
            jsonb_build_object('order_id', v_order_id, 'deducted', v_deducted,
                               'remaining_shortfall', v_remaining));
  end if;

  select count(*) into v_open_left
    from public.reconciliation_queue rq
    join public.order_items oi on oi.id = rq.order_item_id
   where oi.order_id = v_order_id and rq.status = 'open';

  select bool_and(coalesce(qty_approved, 0) >= qty_requested) into v_all_full
    from public.order_items where order_id = v_order_id;

  if v_open_left = 0 and coalesce(v_all_full, false) then
    update public.orders set status = 'approved'
     where id = v_order_id and status = 'partially_approved';
  end if;

  return jsonb_build_object(
    'reconciliation_id',   p_id,
    'action',              p_action,
    'deducted',            v_deducted,
    'remaining_shortfall', greatest(v_remaining, 0)
  );
end;
$$;


------------------------------------------------------------------
-- B. stock_locations: staff read, admin write
------------------------------------------------------------------
drop policy if exists "stock_locations staff write" on public.stock_locations;
create policy "stock_locations admin insert" on public.stock_locations
  for insert to authenticated with check ( (select public.is_admin()) );
create policy "stock_locations admin update" on public.stock_locations
  for update to authenticated using ( (select public.is_admin()) ) with check ( (select public.is_admin()) );
create policy "stock_locations admin delete" on public.stock_locations
  for delete to authenticated using ( (select public.is_admin()) );

------------------------------------------------------------------
-- C. split FOR ALL write policies (no more duplicate SELECT policies)
------------------------------------------------------------------

drop policy if exists "import_profiles staff write" on public.import_profiles;
create policy "import_profiles staff insert" on public.import_profiles for insert to authenticated with check ( (select public.is_admin_or_staff()) );
create policy "import_profiles staff update" on public.import_profiles for update to authenticated using ( (select public.is_admin_or_staff()) ) with check ( (select public.is_admin_or_staff()) );
create policy "import_profiles staff delete" on public.import_profiles for delete to authenticated using ( (select public.is_admin_or_staff()) );

drop policy if exists "import_runs staff write" on public.import_runs;
create policy "import_runs staff insert" on public.import_runs for insert to authenticated with check ( (select public.is_admin_or_staff()) );
create policy "import_runs staff update" on public.import_runs for update to authenticated using ( (select public.is_admin_or_staff()) ) with check ( (select public.is_admin_or_staff()) );
create policy "import_runs staff delete" on public.import_runs for delete to authenticated using ( (select public.is_admin_or_staff()) );

drop policy if exists "import_synonyms admin write" on public.import_synonyms;
create policy "import_synonyms admin insert" on public.import_synonyms for insert to authenticated with check ( (select public.is_admin()) );
create policy "import_synonyms admin update" on public.import_synonyms for update to authenticated using ( (select public.is_admin()) ) with check ( (select public.is_admin()) );
create policy "import_synonyms admin delete" on public.import_synonyms for delete to authenticated using ( (select public.is_admin()) );

drop policy if exists "invites admin all" on public.invites;
create policy "invites admin insert" on public.invites for insert to authenticated with check ( (select public.is_admin()) );
create policy "invites admin update" on public.invites for update to authenticated using ( (select public.is_admin()) ) with check ( (select public.is_admin()) );
create policy "invites admin delete" on public.invites for delete to authenticated using ( (select public.is_admin()) );

drop policy if exists "prices admin write" on public.prices;
create policy "prices admin insert" on public.prices for insert to authenticated with check ( (select public.is_admin()) );
create policy "prices admin update" on public.prices for update to authenticated using ( (select public.is_admin()) ) with check ( (select public.is_admin()) );
create policy "prices admin delete" on public.prices for delete to authenticated using ( (select public.is_admin()) );

drop policy if exists "pricing_settings admin write" on public.pricing_settings;
create policy "pricing_settings admin insert" on public.pricing_settings for insert to authenticated with check ( (select public.is_admin()) );
create policy "pricing_settings admin update" on public.pricing_settings for update to authenticated using ( (select public.is_admin()) ) with check ( (select public.is_admin()) );
create policy "pricing_settings admin delete" on public.pricing_settings for delete to authenticated using ( (select public.is_admin()) );

drop policy if exists "product_variants staff write" on public.product_variants;
create policy "product_variants staff insert" on public.product_variants for insert to authenticated with check ( (select public.is_admin_or_staff()) );
create policy "product_variants staff update" on public.product_variants for update to authenticated using ( (select public.is_admin_or_staff()) ) with check ( (select public.is_admin_or_staff()) );
create policy "product_variants staff delete" on public.product_variants for delete to authenticated using ( (select public.is_admin_or_staff()) );

drop policy if exists "products staff write" on public.products;
create policy "products staff insert" on public.products for insert to authenticated with check ( (select public.is_admin_or_staff()) );
create policy "products staff update" on public.products for update to authenticated using ( (select public.is_admin_or_staff()) ) with check ( (select public.is_admin_or_staff()) );
create policy "products staff delete" on public.products for delete to authenticated using ( (select public.is_admin_or_staff()) );

drop policy if exists "suppliers admin write" on public.suppliers;
create policy "suppliers admin insert" on public.suppliers for insert to authenticated with check ( (select public.is_admin()) );
create policy "suppliers admin update" on public.suppliers for update to authenticated using ( (select public.is_admin()) ) with check ( (select public.is_admin()) );
create policy "suppliers admin delete" on public.suppliers for delete to authenticated using ( (select public.is_admin()) );

drop policy if exists "tiers admin write" on public.tiers;
create policy "tiers admin insert" on public.tiers for insert to authenticated with check ( (select public.is_admin()) );
create policy "tiers admin update" on public.tiers for update to authenticated using ( (select public.is_admin()) ) with check ( (select public.is_admin()) );
create policy "tiers admin delete" on public.tiers for delete to authenticated using ( (select public.is_admin()) );

drop policy if exists "vendor_grade_map admin write" on public.vendor_grade_map;
create policy "vendor_grade_map admin insert" on public.vendor_grade_map for insert to authenticated with check ( (select public.is_admin()) );
create policy "vendor_grade_map admin update" on public.vendor_grade_map for update to authenticated using ( (select public.is_admin()) ) with check ( (select public.is_admin()) );
create policy "vendor_grade_map admin delete" on public.vendor_grade_map for delete to authenticated using ( (select public.is_admin()) );

-- invites: the admin branch of the old FOR ALL policy joins the owner SELECT.
alter policy "invites owner select own sub account invites" on public.invites
  using ( parent_account_id = (select auth.uid()) or (select public.is_admin()) );

------------------------------------------------------------------
-- D. access_requests: wrap the role helper in (select …) so it runs once
--    per statement, not per row (rls_suite "initplan" gate).
------------------------------------------------------------------
alter policy "access_requests staff read" on public.access_requests
  using ( (select public.is_admin_or_staff()) );
alter policy "access_requests staff update" on public.access_requests
  using ( (select public.is_admin_or_staff()) ) with check ( (select public.is_admin_or_staff()) );
