-- Abuse limits for launch (audit 2026-10-18, P1/P2).
--
-- A. request_ip(): the caller's IP from the PostgREST request headers
--    (cf-connecting-ip, else the first x-forwarded-for hop, else x-real-ip).
-- B. hit_rate_limit(bucket, key, max, window): counts hits per key in a
--    private table and raises 'rate_limited' past the limit. A null key
--    (no IP header) is not limited here; the per-e-mail limits still apply.
-- C. Anonymous forms get per-IP limits: access request 5/h (+3/day per
--    e-mail), contact 10/h (+ the existing 5/h per e-mail), newsletter 10/h
--    (replaces the global 50/10min cap a script could exhaust).
-- D. place_order upper bounds: <= 500 lines, <= 100,000 units per line,
--    shipping address <= 2 KB.
-- E. Storage buckets get size and type limits.

create table if not exists public.rate_limit_hits (
  bucket text not null,
  key    text not null,
  at     timestamptz not null default now()
);
create index if not exists rate_limit_hits_lookup on public.rate_limit_hits (bucket, key, at desc);
alter table public.rate_limit_hits enable row level security;
-- no policies: only SECURITY DEFINER functions touch it
revoke all on public.rate_limit_hits from anon, authenticated;

create or replace function public.request_ip()
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(btrim(coalesce(
    (current_setting('request.headers', true)::json ->> 'cf-connecting-ip'),
    split_part(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ',', 1),
    (current_setting('request.headers', true)::json ->> 'x-real-ip')
  )), '')
$$;

create or replace function public.hit_rate_limit(p_bucket text, p_key text, p_max integer, p_window interval)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  if p_key is null then
    return;
  end if;
  select count(*) into v_count from public.rate_limit_hits
   where bucket = p_bucket and key = p_key and at > now() - p_window;
  if v_count >= p_max then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  insert into public.rate_limit_hits (bucket, key) values (p_bucket, p_key);
  -- keep the table small
  if random() < 0.02 then
    delete from public.rate_limit_hits where at < now() - interval '2 days';
  end if;
end;
$$;

revoke all on function public.hit_rate_limit(text, text, integer, interval) from public, anon, authenticated;
revoke all on function public.request_ip() from public, anon, authenticated;

create or replace function public.submit_access_request(p_full_name text, p_email text, p_business_name text default null, p_phone text default null, p_tier_interest text default null, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_full_name is null or btrim(p_full_name) = '' then
    raise exception 'name_required' using errcode = 'P0001';
  end if;
  if p_email is null or lower(btrim(p_email)) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'bad_email' using errcode = 'P0001';
  end if;
  perform public.hit_rate_limit('access_request', public.request_ip(), 5, interval '1 hour');
  perform public.hit_rate_limit('access_request_email', lower(btrim(p_email)), 3, interval '1 day');
  insert into public.access_requests (full_name, email, business_name, phone, tier_interest, note)
  values (btrim(p_full_name), lower(btrim(p_email)), nullif(btrim(p_business_name), ''),
          nullif(btrim(p_phone), ''), nullif(btrim(p_tier_interest), ''), nullif(btrim(p_note), ''));
end $$;

revoke all on function public.submit_access_request(text, text, text, text, text, text) from public;
grant execute on function public.submit_access_request(text, text, text, text, text, text) to anon, authenticated;

create or replace function public.submit_contact_message(
  p_email text,
  p_topic text,
  p_message text,
  p_business_name text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_msg   text := btrim(coalesce(p_message, ''));
  v_biz   text := nullif(btrim(coalesce(p_business_name, '')), '');
  v_recent int;
begin
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(v_email) > 254 then
    raise exception 'bad_email' using errcode = 'P0001';
  end if;
  if p_topic is null or p_topic not in ('tier_pricing', 'reseller', 'bulk_quote', 'order_support', 'other') then
    raise exception 'bad_topic' using errcode = 'P0001';
  end if;
  if v_msg = '' then
    raise exception 'message_required' using errcode = 'P0001';
  end if;
  if length(v_msg) > 4000 or length(coalesce(v_biz, '')) > 200 then
    raise exception 'too_long' using errcode = 'P0001';
  end if;

  select count(*) into v_recent
    from public.contact_messages
   where email = v_email and created_at > now() - interval '1 hour';
  if v_recent >= 5 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  perform public.hit_rate_limit('contact', public.request_ip(), 10, interval '1 hour');

  insert into public.contact_messages (email, business_name, topic, message, sender_id)
  values (v_email, v_biz, p_topic, v_msg, auth.uid());
end;
$$;

revoke all on function public.submit_contact_message(text, text, text, text) from public;
grant execute on function public.submit_contact_message(text, text, text, text) to anon, authenticated;

create or replace function public.subscribe_newsletter(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email  text := lower(btrim(coalesce(p_email, '')));
begin
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(v_email) > 254 then
    raise exception 'bad_email' using errcode = 'P0001';
  end if;

  -- Per client IP instead of one global cap (a script could exhaust the
  -- global cap and block every real signup).
  perform public.hit_rate_limit('newsletter', public.request_ip(), 10, interval '1 hour');

  insert into public.newsletter_signups (email, subscriber_id)
  values (v_email, auth.uid())
  on conflict (email) do update
    set unsubscribed_at = null
    where public.newsletter_signups.unsubscribed_at is not null;
end;
$$;

revoke all on function public.subscribe_newsletter(text) from public;
grant execute on function public.subscribe_newsletter(text) to anon, authenticated;

create or replace function public.place_order(
  p_items jsonb,
  p_shipping_address jsonb default null,
  p_note text default null,
  p_client_ref uuid default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_role     public.user_role;
  v_tier     public.customer_tier;
  v_is_test  boolean;
  v_order    public.orders;
  v_variant  uuid;
  v_loc      uuid;
  v_qty      integer;
  v_price    bigint;
  v_subtotal bigint := 0;
  v_select   boolean;
  v_missing  text[];
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select role, tier, is_test into v_role, v_tier, v_is_test
    from public.profiles where id = v_uid;

  if v_role is distinct from 'customer' then
    raise exception 'customer_only' using errcode = '42501';
  end if;
  if v_tier is null then
    raise exception 'no_tier' using errcode = 'P0001';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty_order' using errcode = 'P0001';
  end if;
  -- Upper bounds (anything larger is a mistake or an attack, not an order).
  if jsonb_array_length(p_items) > 500 then
    raise exception 'too_many_items' using errcode = 'P0001';
  end if;
  if p_shipping_address is not null and length(p_shipping_address::text) > 2000 then
    raise exception 'bad_address' using errcode = 'P0001';
  end if;

  -- Idempotency: the same checkout attempt (same client ref) returns the order
  -- it already created instead of creating a second one.
  if p_client_ref is not null then
    select * into v_order from public.orders where customer_id = v_uid and client_ref = p_client_ref;
    if found then
      return v_order;
    end if;
  end if;

  -- Enforcement (app_settings.enforcement_points, stage 'checkout'): hard gate.
  v_missing := public.order_requirements_missing(v_uid, 'checkout', p_shipping_address);
  if cardinality(v_missing) > 0 then
    raise exception 'requirements_missing' using errcode = 'P0001', detail = array_to_string(v_missing, ',');
  end if;

  select coalesce((value->>'enabled')::boolean, false) into v_select
    from public.app_settings where key = 'order_location_selection';
  v_select := coalesce(v_select, false);

  if v_select then
    if exists (
      select 1 from (
        select bool_or((e->>'location_id') is not null) as has_loc,
               bool_and((e->>'location_id') is not null) as all_loc
        from jsonb_array_elements(p_items) e
        group by (e->>'variant_id')
      ) g where g.has_loc and not g.all_loc
    ) then
      raise exception 'partial_allocation' using errcode = 'P0001';
    end if;

    if exists (
      select 1 from jsonb_array_elements(p_items) e
      where (e->>'location_id') is not null
        and not exists (
          select 1 from public.inventory inv
          join public.stock_locations sl on sl.id = inv.location_id
          where inv.variant_id = (e->>'variant_id')::uuid
            and inv.location_id = (e->>'location_id')::uuid
            and sl.active
        )
    ) then
      raise exception 'bad_location' using errcode = 'P0001';
    end if;
  end if;

  begin
    insert into public.orders (customer_id, status, tier_at_order, subtotal_cents,
                               shipping_address, notes, is_test, client_ref)
    values (v_uid, 'pending', v_tier, 0,
            p_shipping_address, nullif(btrim(p_note), ''), coalesce(v_is_test, false), p_client_ref)
    returning * into v_order;
  exception when unique_violation then
    -- A concurrent call with the same client ref won the race: return its order.
    select * into v_order from public.orders where customer_id = v_uid and client_ref = p_client_ref;
    return v_order;
  end;

  for v_variant, v_loc, v_qty in
    select (elem->>'variant_id')::uuid,
           case when v_select then nullif(elem->>'location_id', '')::uuid else null end,
           sum((elem->>'qty')::int)::int
    from jsonb_array_elements(p_items) as elem
    group by (elem->>'variant_id')::uuid,
             case when v_select then nullif(elem->>'location_id', '')::uuid else null end
  loop
    if v_variant is null then
      raise exception 'bad_variant' using errcode = 'P0001';
    end if;
    if v_qty is null or v_qty <= 0 or v_qty > 100000 then
      raise exception 'bad_qty' using errcode = 'P0001';
    end if;

    -- Hidden (unpublished) products cannot be ordered, even by a stale cart.
    if not exists (
      select 1 from public.product_variants pv
      join public.products p on p.id = pv.product_id
      where pv.id = v_variant and p.published
    ) then
      raise exception 'bad_variant' using errcode = 'P0001', detail = v_variant::text;
    end if;

    select price_cents into v_price
      from public.prices
     where variant_id = v_variant and tier = v_tier and visible;
    if v_price is null then
      raise exception 'no_price' using errcode = 'P0001', detail = v_variant::text;
    end if;

    insert into public.order_items (order_id, variant_id, requested_location_id,
                                    qty_requested, unit_price_cents, tier)
    values (v_order.id, v_variant, v_loc, v_qty, v_price, v_tier);

    v_subtotal := v_subtotal + v_price * v_qty;
  end loop;

  update public.orders set subtotal_cents = v_subtotal
   where id = v_order.id
  returning * into v_order;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, payload)
  values (v_uid, 'order_placed', 'orders', v_order.id,
          jsonb_build_object('subtotal_cents', v_subtotal, 'tier', v_tier,
                             'location_selection', v_select));

  return v_order;
end;
$$;

revoke all on function public.place_order(jsonb, jsonb, text, uuid) from public, anon;
grant execute on function public.place_order(jsonb, jsonb, text, uuid) to authenticated;

update storage.buckets set file_size_limit = 10485760,
       allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
 where id = 'tax-certificates';
update storage.buckets set file_size_limit = 5242880,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id in ('product-photos', 'manual-shots');
