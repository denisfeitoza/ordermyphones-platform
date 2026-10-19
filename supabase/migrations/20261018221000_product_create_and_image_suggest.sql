-- Manual product creation + image suggestions over the image bank.
--   suggest_product_images  ranked candidates with a reason: exact, family,
--                           similar (trigram), brand
--   attach_product_image    staff pick: 'exact' teaches the bank (the model key
--                           joins the asset, so the next import auto-matches);
--                           'approx' shows it labelled as illustrative
--   create_product          product + variants + optional opening stock +
--                           image, in one transaction, then reprice
-- All staff-only, audited, not callable by anon.

create or replace function public.suggest_product_images(p_model text, p_make text default null, p_color text default null)
returns table (asset_id uuid, url text, kind text, label text, model_keys text[], color_key text, reason text, score real)
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_key   text := public.omp_model_key(p_model);
  v_fam   text := public.omp_family_key(public.omp_model_key(p_model));
  v_color text := case when nullif(btrim(p_color), '') is null then null else public.color_key(p_color) end;
begin
  if not public.is_admin_or_staff() then
    raise exception 'staff_only' using errcode = '42501';
  end if;

  return query
  with scored as (
    select a.*,
           (select max(extensions.similarity(mk, v_key)) from unnest(a.model_keys) mk) as sim,
           case
             when v_key <> '' and v_key = any(a.model_keys) then 'exact'
             when v_fam <> '' and exists (select 1 from unnest(a.model_keys) mk where public.omp_family_key(mk) = v_fam) then 'family'
             when v_key <> '' and (select max(extensions.similarity(mk, v_key)) from unnest(a.model_keys) mk) >= 0.3 then 'similar'
             when p_make is not null and lower(a.make) = lower(btrim(p_make)) then 'brand'
           end as why
      from public.image_assets a
  )
  select s.id, s.url, s.kind, s.label, s.model_keys, s.color_key, s.why,
         (case s.why when 'exact' then 1.0 when 'family' then 0.7 when 'similar' then 0.4 + coalesce(s.sim, 0) * 0.2 else 0.1 end
          + case when v_color is not null and s.color_key = v_color then 0.05 else 0 end)::real
    from scored s
   where s.why is not null
   order by 8 desc, (s.kind = 'upload') desc, s.created_at desc
   limit 12;
end;
$$;

create or replace function public.attach_product_image(p_product_id uuid, p_asset_id uuid, p_mode text default 'exact')
returns public.products
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_prod public.products;
  v_a    public.image_assets;
  v_key  text;
begin
  if v_uid is null or not public.is_admin_or_staff() then
    raise exception 'staff_only' using errcode = '42501';
  end if;
  if p_mode not in ('exact', 'approx') then
    raise exception 'bad_mode' using errcode = 'P0001';
  end if;
  select * into v_prod from public.products where id = p_product_id for update;
  if not found then
    raise exception 'product_not_found' using errcode = 'P0001';
  end if;

  if p_asset_id is null then
    update public.products set image_url = null, image_asset_id = null, image_approx = false, updated_at = now()
     where id = p_product_id returning * into v_prod;
  else
    select * into v_a from public.image_assets where id = p_asset_id;
    if not found then
      raise exception 'asset_not_found' using errcode = 'P0001';
    end if;
    v_key := public.omp_model_key(v_prod.model);
    -- Learning: staff confirm this image IS this model, so the model's key
    -- joins the asset and future imports of that spelling match exactly.
    if p_mode = 'exact' and v_key <> '' and not (v_key = any(v_a.model_keys)) then
      update public.image_assets set model_keys = array_append(model_keys, v_key) where id = v_a.id;
    end if;
    update public.products
       set image_url = v_a.url, image_asset_id = v_a.id, image_approx = (p_mode = 'approx'), updated_at = now()
     where id = p_product_id returning * into v_prod;
  end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, payload)
  values (v_uid, 'product_image_set', 'products', p_product_id,
          jsonb_build_object('asset_id', p_asset_id, 'mode', p_mode));
  return v_prod;
end;
$$;

create or replace function public.create_product(p jsonb)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_make     text := nullif(btrim(p->>'make'), '');
  v_model    text := nullif(btrim(p->>'model'), '');
  v_number   text := nullif(btrim(p->>'model_number'), '');
  v_category public.product_category;
  v_desc     text := nullif(btrim(p->>'description'), '');
  v_pid      uuid;
  v_vid      uuid;
  v_var      jsonb;
  v_stock    jsonb;
  v_carrier  public.carrier_code;
  v_lock     public.lock_status;
  v_grade    text;
  v_cap      text;
  v_color    text;
  v_qty      integer;
  v_cost     bigint;
  v_stocked  uuid[] := '{}';
  v_asset    uuid := nullif(p->>'image_asset_id', '')::uuid;
  v_mode     text := coalesce(nullif(p->>'image_mode', ''), 'exact');
begin
  if v_uid is null or not public.is_admin_or_staff() then
    raise exception 'staff_only' using errcode = '42501';
  end if;

  if v_make is null or length(v_make) > 40 then
    raise exception 'bad_make' using errcode = 'P0001';
  end if;
  -- Reuse the existing spelling of a make ("apple" -> "Apple"), so the
  -- product lands next to the imported ones instead of a twin brand.
  v_make := coalesce((select make from public.products where lower(make) = lower(v_make) order by make limit 1), v_make);
  if v_model is null or length(v_model) > 120 then
    raise exception 'bad_model' using errcode = 'P0001';
  end if;
  if v_number is null or length(v_number) > 60 then
    raise exception 'bad_model_number' using errcode = 'P0001';
  end if;
  begin
    v_category := coalesce(nullif(p->>'category', ''), 'phones')::public.product_category;
  exception when invalid_text_representation then
    raise exception 'bad_category' using errcode = 'P0001';
  end;
  if v_desc is not null and length(v_desc) > 4000 then
    raise exception 'bad_description' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.products where make = v_make and model_number = v_number) then
    raise exception 'product_exists' using errcode = 'P0001', detail = v_make || ' ' || v_number;
  end if;
  if jsonb_typeof(p->'variants') is distinct from 'array'
     or jsonb_array_length(p->'variants') = 0 or jsonb_array_length(p->'variants') > 100 then
    raise exception 'bad_variants' using errcode = 'P0001';
  end if;

  insert into public.products (make, model, model_number, category, description, published)
  values (v_make, v_model, v_number, v_category, v_desc, coalesce((p->>'published')::boolean, false))
  returning id into v_pid;

  for v_var in select * from jsonb_array_elements(p->'variants') loop
    v_cap   := nullif(btrim(v_var->>'capacity'), '');
    v_color := nullif(btrim(v_var->>'color'), '');
    v_grade := nullif(btrim(v_var->>'grade'), '');
    if v_cap is null or length(v_cap) > 20 or (v_color is not null and length(v_color) > 40) then
      raise exception 'bad_variant' using errcode = 'P0001';
    end if;
    -- Only grades the catalog knows how to map to a CTIA grade.
    if v_grade is null or not exists (select 1 from public.vendor_grade_map where vendor_grade = v_grade) then
      raise exception 'bad_grade' using errcode = 'P0001', detail = coalesce(v_grade, '');
    end if;
    begin
      v_carrier := coalesce(nullif(v_var->>'carrier', ''), 'UNL')::public.carrier_code;
      v_lock    := coalesce(nullif(v_var->>'lock_status', ''), 'unlocked')::public.lock_status;
    exception when invalid_text_representation then
      raise exception 'bad_variant' using errcode = 'P0001';
    end;

    begin
      insert into public.product_variants (product_id, capacity, color, carrier, carrier_raw, lock_status, grade, grade_scale, sku)
      values (v_pid, v_cap, v_color, v_carrier, v_carrier::text, v_lock, v_grade,
              case when v_grade like 'DLS%' then 'DLS' when v_grade like 'TPS%' then 'TPS' else 'OTHER' end::public.grade_scale,
              public.omp_make_sku(v_model, v_number, v_cap, v_color, v_grade, v_carrier, v_lock))
      returning id into v_vid;
    exception when unique_violation then
      raise exception 'duplicate_variant' using errcode = 'P0001', detail = concat_ws(' ', v_cap, v_color, v_grade, v_carrier::text);
    end;

    -- Optional opening stock, through the ledger like any other movement.
    if jsonb_typeof(v_var->'stock') = 'array' then
      for v_stock in select * from jsonb_array_elements(v_var->'stock') loop
        v_qty  := (v_stock->>'qty')::integer;
        v_cost := (v_stock->>'unit_cost_cents')::bigint;
        if v_qty is null or v_qty < 1 or v_qty > 1000000 or v_cost is null or v_cost < 1 or v_cost > 10000000 then
          raise exception 'bad_stock' using errcode = 'P0001';
        end if;
        if not exists (select 1 from public.stock_locations where id = (v_stock->>'location_id')::uuid and active) then
          raise exception 'bad_location' using errcode = 'P0001';
        end if;
        insert into public.inventory (variant_id, location_id, qty, unit_cost_cents, as_of)
        values (v_vid, (v_stock->>'location_id')::uuid, 0, v_cost, now())
        on conflict (variant_id, location_id) do update set unit_cost_cents = excluded.unit_cost_cents;
        insert into public.stock_movements (variant_id, location_id, delta, reason, ref_type, ref_id, unit_cost_cents, actor_id, note)
        values (v_vid, (v_stock->>'location_id')::uuid, v_qty, 'manual_adjust', 'products', v_pid, v_cost, v_uid, 'opening stock (manual product)');
        v_stocked := array_append(v_stocked, v_vid);
      end loop;
    end if;
  end loop;

  if v_asset is not null then
    perform public.attach_product_image(v_pid, v_asset, v_mode);
  end if;
  if cardinality(v_stocked) > 0 then
    perform public.reprice_variants(v_stocked);
  end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, payload)
  values (v_uid, 'product_created', 'products', v_pid,
          jsonb_build_object('make', v_make, 'model', v_model, 'model_number', v_number,
                             'variants', jsonb_array_length(p->'variants'), 'stocked_variants', cardinality(v_stocked)));
  return v_pid;
end;
$$;

revoke all on function public.suggest_product_images(text, text, text) from public, anon;
revoke all on function public.attach_product_image(uuid, uuid, text) from public, anon;
revoke all on function public.create_product(jsonb) from public, anon;
grant execute on function public.suggest_product_images(text, text, text) to authenticated;
grant execute on function public.attach_product_image(uuid, uuid, text) to authenticated;
grant execute on function public.create_product(jsonb) to authenticated;
