-- #07 CRUD for stock locations: creating is a plain admin/staff INSERT (RLS
-- 'staff write=ALL' allows it). Deleting is the only risky op, so it goes
-- through a guarded RPC: a location may be hard-deleted ONLY when it holds no
-- stock and never has (no inventory rows, no ledger movements). Anything with
-- history must be deactivated or merged — never lose the audit trail.
create or replace function public.delete_stock_location(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_code text; v_inv integer; v_mov integer;
begin
  if not public.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  select code into v_code from public.stock_locations where id = p_id;
  if v_code is null then
    raise exception 'location_not_found' using errcode = 'P0002';
  end if;
  select count(*) into v_inv from public.inventory where location_id = p_id;
  select count(*) into v_mov from public.stock_movements where location_id = p_id;
  if v_inv > 0 or v_mov > 0 then
    raise exception 'location_has_history' using errcode = 'P0001',
      hint = 'Deactivate or merge this location instead — it has stock or ledger history and must keep its audit trail.';
  end if;
  delete from public.stock_locations where id = p_id;
end;
$$;
revoke execute on function public.delete_stock_location(uuid) from public, anon;
grant execute on function public.delete_stock_location(uuid) to authenticated;
