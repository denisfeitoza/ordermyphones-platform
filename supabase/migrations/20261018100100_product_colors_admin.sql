-- Admin → Products: the colours a product actually has, keyed exactly like
-- catalog_listing (public.color_key), with the staff photo for each.
-- security_invoker: callers see only what RLS on product_variants and
-- product_color_images already lets them see (staff read; customers nothing
-- from product_color_images).

create or replace view public.product_colors_admin
with (security_invoker = true) as
select pv.product_id,
       public.color_key(pv.color)          as color_key,
       min(pv.color)                       as color_label,
       count(*)::integer                   as variant_count,
       max(ci.image_url)                   as image_url
  from public.product_variants pv
  left join public.product_color_images ci
    on ci.product_id = pv.product_id and ci.color_key = public.color_key(pv.color)
 where public.color_key(pv.color) is not null
 group by pv.product_id, public.color_key(pv.color);

comment on view public.product_colors_admin is
  'Per-product colour list for the admin photo editor (security_invoker; staff-only in practice via product_color_images RLS).';

revoke all on public.product_colors_admin from anon;
grant select on public.product_colors_admin to authenticated;
