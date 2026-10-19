-- Shipping (RFC-001 D3). Staff set the shipping charge and the packed box
-- (dims/weight); for "customer label" orders that asks the buyer for a label,
-- which they upload as a PDF/image to a private bucket under their account.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shipping-labels', 'shipping-labels', false, 5242880, array['application/pdf', 'image/png', 'image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- <account_id>/<order_id>/<file>: the buyer writes/reads only their account
-- folder; staff read and manage everything.
create policy "shipping-labels own insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'shipping-labels' and (storage.foldername(name))[1] = (select public.current_account_id())::text);
create policy "shipping-labels own read" on storage.objects for select to authenticated
  using (bucket_id = 'shipping-labels'
         and ((storage.foldername(name))[1] = (select public.current_account_id())::text or (select public.is_admin_or_staff())));
create policy "shipping-labels staff delete" on storage.objects for delete to authenticated
  using (bucket_id = 'shipping-labels' and (select public.is_admin_or_staff()));

-- Staff: shipping charge (OMP ships) and the packed box. For customer-label
-- orders, saving the box asks the buyer for the label.
create or replace function public.set_order_shipping(p_order_id uuid, p_shipping_cents bigint, p_package jsonb default null)
returns public.orders
language plpgsql
security definer
set search_path to ''
as $$
declare v_uid uuid := auth.uid(); v_order public.orders; v_role text;
begin
  if v_uid is null or not public.is_admin_or_staff() then
    raise exception 'staff_only' using errcode = '42501';
  end if;
  if p_shipping_cents is null or p_shipping_cents < 0 or p_shipping_cents > 10000000 then
    raise exception 'bad_shipping_cost' using errcode = 'P0001';
  end if;
  if p_package is not null and (jsonb_typeof(p_package) <> 'object' or length(p_package::text) > 500) then
    raise exception 'bad_package' using errcode = 'P0001';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0001'; end if;
  if v_order.status in ('shipped', 'cancelled', 'rejected') then
    raise exception 'order_closed' using errcode = 'P0001', detail = v_order.status::text;
  end if;

  update public.orders
     set shipping_cents = p_shipping_cents,
         package = coalesce(p_package, package),
         shipping_stage = case
           when shipping_method = 'customer_label' and p_package is not null and shipping_stage = 'none' then 'awaiting_label'
           else shipping_stage end,
         updated_at = now()
   where id = p_order_id returning * into v_order;

  select role::text into v_role from public.profiles where id = v_uid;
  if v_order.shipping_stage = 'awaiting_label' and p_package is not null then
    insert into public.order_events (order_id, actor_id, actor_role, kind, summary, changes)
    values (p_order_id, v_uid, coalesce(v_role, 'staff'), 'label_requested', null,
            jsonb_build_array(jsonb_build_object('type', 'label_requested', 'label', 'Packed — send your shipping label', 'package', v_order.package)));
  end if;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, payload)
  values (v_uid, 'order_shipping_set', 'orders', p_order_id,
          jsonb_build_object('shipping_cents', p_shipping_cents, 'package', v_order.package, 'stage', v_order.shipping_stage));
  return v_order;
end;
$$;

-- Buyer: the label for a packed order is in the bucket — record it.
create or replace function public.attach_shipping_label(p_order_id uuid, p_path text)
returns public.orders
language plpgsql
security definer
set search_path to ''
as $$
declare v_uid uuid := auth.uid(); v_acct uuid := public.current_account_id(); v_order public.orders;
begin
  if v_uid is null or v_acct is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select o.* into v_order from public.orders o join public.profiles p on p.id = o.customer_id
   where o.id = p_order_id and coalesce(p.parent_account_id, p.id) = v_acct
     for update of o;
  if not found then raise exception 'order_not_found' using errcode = 'P0001'; end if;
  if v_order.shipping_method <> 'customer_label' or v_order.shipping_stage not in ('awaiting_label', 'label_received') then
    raise exception 'label_not_requested' using errcode = 'P0001';
  end if;
  if p_path is null or p_path not like v_acct::text || '/' || p_order_id::text || '/%'
     or not exists (select 1 from storage.objects so where so.bucket_id = 'shipping-labels' and so.name = p_path) then
    raise exception 'bad_label' using errcode = 'P0001';
  end if;
  update public.orders set label_path = p_path, shipping_stage = 'label_received', updated_at = now()
   where id = p_order_id returning * into v_order;
  insert into public.order_events (order_id, actor_id, actor_role, kind, summary, changes)
  values (p_order_id, v_uid, 'customer', 'label_received', null,
          jsonb_build_array(jsonb_build_object('type', 'label_received', 'label', 'Shipping label received')));
  insert into public.audit_log (actor_id, action, entity_type, entity_id, payload)
  values (v_uid, 'order_label_received', 'orders', p_order_id, jsonb_build_object('path', p_path));
  return v_order;
end;
$$;

revoke all on function public.set_order_shipping(uuid, bigint, jsonb) from public, anon;
revoke all on function public.attach_shipping_label(uuid, text) from public, anon;
grant execute on function public.set_order_shipping(uuid, bigint, jsonb) to authenticated;
grant execute on function public.attach_shipping_label(uuid, text) to authenticated;
