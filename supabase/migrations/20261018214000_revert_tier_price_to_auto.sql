-- "Revert to auto": an admin hands a manually set wholesale / distributor /
-- retailer price back to the pricing engine. prices_protect_manual blocks the
-- engine from overwriting a 'manual' or 'override' row, so the row is first
-- released (source 'reverting'), then repriced; if the engine had nothing to
-- write (no in-stock cost), the row is still marked 'engine' so the next
-- reprice owns it. Consumer prices are always authored (the engine never
-- invents one), so they cannot be reverted.
create or replace function public.revert_tier_price_to_auto(p_variant_id uuid, p_tier public.customer_tier)
returns public.prices
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_before public.prices;
  v_after  public.prices;
begin
  if not (select public.is_admin()) then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  if p_tier = 'consumer' then
    raise exception 'consumer_is_manual' using errcode = 'P0001';
  end if;

  select * into v_before from public.prices
   where variant_id = p_variant_id and tier = p_tier for update;
  if not found or v_before.source not in ('manual', 'override') then
    raise exception 'not_manual' using errcode = 'P0001';
  end if;

  update public.prices set source = 'reverting'
   where variant_id = p_variant_id and tier = p_tier;

  perform public.reprice_variants(array[p_variant_id]);

  update public.prices set source = 'engine'
   where variant_id = p_variant_id and tier = p_tier and source = 'reverting';

  select * into v_after from public.prices where variant_id = p_variant_id and tier = p_tier;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, payload)
  values (auth.uid(), 'price_reverted_to_auto', 'prices', v_after.id,
          jsonb_build_object('variant_id', p_variant_id, 'tier', p_tier,
                             'before_cents', v_before.price_cents, 'before_source', v_before.source,
                             'after_cents', v_after.price_cents, 'after_visible', v_after.visible));
  return v_after;
end;
$$;

revoke all on function public.revert_tier_price_to_auto(uuid, public.customer_tier) from public, anon;
grant execute on function public.revert_tier_price_to_auto(uuid, public.customer_tier) to authenticated;
