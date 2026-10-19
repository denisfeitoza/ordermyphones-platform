-- Stock count reprices the variant when the balance changes, the same way an
-- import does: a location going to or from zero changes the cost basis.
create or replace function public.adjust_stock_count(p_inventory_id uuid, p_counted integer, p_note text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_inv   public.inventory;
  v_delta integer;
  v_note  text := nullif(btrim(p_note), '');
begin
  if v_uid is null or not public.is_admin_or_staff() then
    raise exception 'staff_only' using errcode = '42501';
  end if;
  if p_counted is null or p_counted < 0 or p_counted > 1000000 then
    raise exception 'bad_qty' using errcode = 'P0001';
  end if;
  if v_note is null or length(v_note) > 500 then
    raise exception 'note_required' using errcode = 'P0001';
  end if;

  -- Lock the balance so two people counting at once can't both apply a delta
  -- computed from the same starting number.
  select * into v_inv from public.inventory where id = p_inventory_id for update;
  if not found then
    raise exception 'inventory_not_found' using errcode = 'P0001';
  end if;

  v_delta := p_counted - v_inv.qty;

  if v_delta <> 0 then
    insert into public.stock_movements (variant_id, location_id, delta, reason, ref_type, ref_id, actor_id, note)
    values (v_inv.variant_id, v_inv.location_id, v_delta, 'manual_adjust', 'inventory', v_inv.id, v_uid, v_note);
    -- Like an import: the price basis is the highest cost among in-stock
    -- locations, so a location going to or from zero can move the price
    -- (or delist / relist the variant).
    perform public.reprice_variants(array[v_inv.variant_id]);
  end if;

  -- A physical count is an exact number, not an "at least" figure from a feed.
  update public.inventory set qty_is_floor = false where id = v_inv.id and qty_is_floor;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, payload)
  values (v_uid, 'stock_count_adjusted', 'inventory', v_inv.id,
          jsonb_build_object('variant_id', v_inv.variant_id, 'location_id', v_inv.location_id,
                             'before', v_inv.qty, 'after', p_counted, 'delta', v_delta, 'note', v_note));

  return jsonb_build_object('before', v_inv.qty, 'after', p_counted, 'delta', v_delta);
end;
$$;
