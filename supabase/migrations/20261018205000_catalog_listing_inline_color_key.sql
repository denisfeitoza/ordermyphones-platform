-- catalog_listing performance (audit 2026-10-18): the colour-photo join called
-- public.color_key() once per variant (a non-inlinable function with its own
-- lookup). The same rule is now inlined as joins. Column list and output are
-- unchanged; grants survive create or replace (read-only per 20261018200000).

create or replace view public.catalog_listing as
 WITH base AS (
         SELECT pv.id AS variant_id,
            pv.sku,
            p.make,
            p.model,
            pv.capacity,
            pv.color,
            pv.carrier,
            pv.lock_status,
            COALESCE(g.ctia, 'C'::ctia_grade) AS ctia_grade,
            pv.created_at,
            p.image_url,
            p.description,
            p.category,
            ci.image_url AS color_image_url
           FROM product_variants pv
             JOIN products p ON p.id = pv.product_id AND p.published
             LEFT JOIN LATERAL ( SELECT vgm.ctia
                   FROM vendor_grade_map vgm
                  WHERE upper(TRIM(BOTH FROM vgm.vendor_grade)) = upper(TRIM(BOTH FROM pv.grade))
                  ORDER BY vgm.ctia DESC
                 LIMIT 1) g ON true
             -- colour key inlined (same rules as public.color_key): a plain join
             -- the planner can hash, instead of one function call per variant
             LEFT JOIN LATERAL ( SELECT nullif(regexp_replace(replace(lower(trim(coalesce(pv.color, ''))), 'grey', 'gray'), '\s+', ' ', 'g'), '') AS k ) nk ON true
             LEFT JOIN import_synonyms syn ON syn.kind = 'color_value' AND syn.canonical_field = 'color' AND syn.synonym = nk.k
             LEFT JOIN product_color_images ci ON ci.product_id = p.id
                   AND nk.k ~ '[a-z]' AND ci.color_key = coalesce(syn.maps_to, nk.k)
          WHERE (EXISTS ( SELECT 1
                   FROM prices pr
                  WHERE pr.variant_id = pv.id AND pr.visible))
        )
 SELECT b.variant_id,
    b.sku,
    b.make,
    b.model,
    b.capacity,
    b.color,
    b.carrier,
    b.lock_status,
    b.ctia_grade,
        CASE b.ctia_grade
            WHEN 'NEW'::ctia_grade THEN 'New'::text
            WHEN 'CPO'::ctia_grade THEN 'Certified Pre-Owned'::text
            WHEN 'A'::ctia_grade THEN 'Certified Pre-Owned · Grade A'::text
            WHEN 'B'::ctia_grade THEN 'Grade B'::text
            WHEN 'C'::ctia_grade THEN 'Grade C'::text
            WHEN 'D'::ctia_grade THEN 'Grade D'::text
            ELSE NULL::text
        END AS ctia_label,
    sum(inv.qty)::integer AS total_qty,
    jsonb_agg(jsonb_build_object('id', sl.id, 'name', sl.display_name, 'qty', inv.qty) ORDER BY sl.display_name) AS locations,
    b.created_at,
    ( SELECT COALESCE(sum(oi.qty_approved), 0)::integer
        FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
       WHERE oi.variant_id = b.variant_id
         AND o.status IN ('approved'::order_status, 'partially_approved'::order_status, 'shipped'::order_status) ) AS sold_qty,
    b.image_url,
    b.description,
    b.category,
    b.color_image_url
   FROM base b
     JOIN inventory inv ON inv.variant_id = b.variant_id AND inv.qty > 0
     JOIN stock_locations sl ON sl.id = inv.location_id AND sl.active
  GROUP BY b.variant_id, b.sku, b.make, b.model, b.capacity, b.color, b.carrier, b.lock_status, b.ctia_grade, b.created_at,
           b.image_url, b.description, b.category, b.color_image_url;

revoke insert, update, delete, truncate, references, trigger on public.catalog_listing from anon, authenticated;
