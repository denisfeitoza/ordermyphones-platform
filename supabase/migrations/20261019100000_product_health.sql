-- "Needs attention" list for the owner after a big import: one row per
-- product with what is missing (image, price, stock, publish) and, for a
-- product without an exact image, the best candidate from the image bank so
-- it can be fixed in one click, one by one or in bulk.

-- Best bank image for a model: exact first, then same family, then a similar
-- name (trigram >= 0.3). Same ranking as suggest_product_images, one row.
create or replace function public.best_image_asset(p_model text, p_make text default null)
returns table (asset_id uuid, url text, reason text)
language sql
stable
security definer
set search_path to ''
as $$
  with k as (select public.omp_model_key(p_model) as key),
  f as (select public.omp_family_key(key) as fam from k),
  scored as (
    select a.id, a.url, a.kind, a.created_at,
           case
             when (select key from k) <> '' and (select key from k) = any(a.model_keys) then 'exact'
             when (select fam from f) <> '' and exists (select 1 from unnest(a.model_keys) mk where public.omp_family_key(mk) = (select fam from f)) then 'family'
             when (select key from k) <> '' and (select max(extensions.similarity(mk, (select key from k))) from unnest(a.model_keys) mk) >= 0.3 then 'similar'
           end as why,
           (select max(extensions.similarity(mk, (select key from k))) from unnest(a.model_keys) mk) as sim
      from public.image_assets a
     where a.color_key is null
       and (p_make is null or a.make is null or lower(a.make) = lower(p_make))
  )
  select id, url, why from scored
   where why is not null
   order by case why when 'exact' then 0 when 'family' then 1 else 2 end, sim desc nulls last, (kind = 'upload') desc, created_at desc
   limit 1
$$;
revoke all on function public.best_image_asset(text, text) from public, anon, authenticated;

create or replace function public.product_health()
returns table (
  product_id uuid,
  make text,
  model text,
  model_number text,
  category text,
  published boolean,
  created_at timestamptz,
  image_url text,
  image_approx boolean,
  variants integer,
  stock_units bigint,
  priced_variants integer,
  best_asset_id uuid,
  best_asset_url text,
  best_reason text
)
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if not public.is_admin_or_staff() then
    raise exception 'staff_only' using errcode = '42501';
  end if;
  return query
  select p.id, p.make, p.model, p.model_number, p.category::text, p.published, p.created_at,
         p.image_url, p.image_approx,
         (select count(*)::integer from public.product_variants v where v.product_id = p.id),
         (select coalesce(sum(i.qty), 0)::bigint
            from public.inventory i
            join public.product_variants v on v.id = i.variant_id
            join public.stock_locations sl on sl.id = i.location_id and sl.active
           where v.product_id = p.id),
         (select count(distinct pr.variant_id)::integer
            from public.prices pr join public.product_variants v on v.id = pr.variant_id
           where v.product_id = p.id and pr.visible),
         b.asset_id, b.url, b.reason
    from public.products p
    left join lateral (
      select * from public.best_image_asset(p.model, p.make)
       where p.image_url is null or p.image_approx
    ) b on true
   order by p.created_at desc, p.make, p.model;
end;
$$;

-- Apply each product's best bank image: an exact match is attached as exact;
-- a family/similar match only when the caller allows it, and then always as
-- illustrative (never taught to the bank). Products that already have an
-- exact image are left alone.
create or replace function public.apply_best_images(p_product_ids uuid[], p_allow_approx boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_p     record;
  v_b     record;
  v_exact integer := 0;
  v_approx integer := 0;
  v_none  integer := 0;
begin
  if v_uid is null or not public.is_admin_or_staff() then
    raise exception 'staff_only' using errcode = '42501';
  end if;
  if p_product_ids is null or cardinality(p_product_ids) > 5000 then
    raise exception 'bad_selection' using errcode = 'P0001';
  end if;

  for v_p in
    select id, model, make from public.products
     where id = any(p_product_ids) and (image_url is null or image_approx)
     order by id
       for update
  loop
    select * into v_b from public.best_image_asset(v_p.model, v_p.make);
    if v_b.asset_id is null then
      v_none := v_none + 1;
    elsif v_b.reason = 'exact' then
      update public.products set image_url = v_b.url, image_asset_id = v_b.asset_id, image_approx = false, updated_at = now() where id = v_p.id;
      v_exact := v_exact + 1;
    elsif p_allow_approx then
      update public.products set image_url = v_b.url, image_asset_id = v_b.asset_id, image_approx = true, updated_at = now() where id = v_p.id;
      v_approx := v_approx + 1;
    else
      v_none := v_none + 1;
    end if;
  end loop;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, payload)
  values (v_uid, 'product_images_bulk', 'products', null,
          jsonb_build_object('requested', cardinality(p_product_ids), 'exact', v_exact, 'approx', v_approx, 'skipped', v_none, 'allow_approx', p_allow_approx));
  return jsonb_build_object('exact', v_exact, 'approx', v_approx, 'skipped', v_none);
end;
$$;

-- Publish or hide many products at once.
create or replace function public.set_products_published(p_product_ids uuid[], p_published boolean)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare v_n integer;
begin
  if auth.uid() is null or not public.is_admin_or_staff() then
    raise exception 'staff_only' using errcode = '42501';
  end if;
  if p_product_ids is null or cardinality(p_product_ids) > 5000 or p_published is null then
    raise exception 'bad_selection' using errcode = 'P0001';
  end if;
  update public.products set published = p_published, updated_at = now()
   where id = any(p_product_ids) and published is distinct from p_published;
  get diagnostics v_n = row_count;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, payload)
  values (auth.uid(), 'products_publish_bulk', 'products', null,
          jsonb_build_object('requested', cardinality(p_product_ids), 'changed', v_n, 'published', p_published));
  return v_n;
end;
$$;

revoke all on function public.product_health() from public, anon;
revoke all on function public.apply_best_images(uuid[], boolean) from public, anon;
revoke all on function public.set_products_published(uuid[], boolean) from public, anon;
grant execute on function public.product_health() to authenticated;
grant execute on function public.apply_best_images(uuid[], boolean) to authenticated;
grant execute on function public.set_products_published(uuid[], boolean) to authenticated;
