-- catalog_listing: append products.image_approx so the store can label an
-- illustrative image. Rebuilt from the live definition (keeps the inlined
-- colour-key joins from 20261018205000); the new column goes last.
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
            ci.image_url AS color_image_url,
            p.image_approx
           FROM product_variants pv
             JOIN products p ON p.id = pv.product_id AND p.published
             LEFT JOIN LATERAL ( SELECT vgm.ctia
                   FROM vendor_grade_map vgm
                  WHERE upper(TRIM(BOTH FROM vgm.vendor_grade)) = upper(TRIM(BOTH FROM pv.grade))
                  ORDER BY vgm.ctia DESC
                 LIMIT 1) g ON true
             LEFT JOIN LATERAL ( SELECT NULLIF(regexp_replace(replace(lower(TRIM(BOTH FROM COALESCE(pv.color, ''::text))), 'grey'::text, 'gray'::text), '\s+'::text, ' '::text, 'g'::text), ''::text) AS k) nk ON true
             LEFT JOIN import_synonyms syn ON syn.kind = 'color_value'::text AND syn.canonical_field = 'color'::text AND syn.synonym = nk.k
             LEFT JOIN product_color_images ci ON ci.product_id = p.id AND nk.k ~ '[a-z]'::text AND ci.color_key = COALESCE(syn.maps_to, nk.k)
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
    ( SELECT COALESCE(sum(oi.qty_approved), 0::bigint)::integer AS "coalesce"
           FROM order_items oi
             JOIN orders o ON o.id = oi.order_id
          WHERE oi.variant_id = b.variant_id AND (o.status = ANY (ARRAY['approved'::order_status, 'partially_approved'::order_status, 'shipped'::order_status]))) AS sold_qty,
    b.image_url,
    b.description,
    b.category,
    b.color_image_url,
    b.image_approx
   FROM base b
     JOIN inventory inv ON inv.variant_id = b.variant_id AND inv.qty > 0
     JOIN stock_locations sl ON sl.id = inv.location_id AND sl.active
  GROUP BY b.variant_id, b.sku, b.make, b.model, b.capacity, b.color, b.carrier, b.lock_status, b.ctia_grade, b.created_at, b.image_url, b.description, b.category, b.color_image_url, b.image_approx;
