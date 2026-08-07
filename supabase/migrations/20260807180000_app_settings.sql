-- 20260807180000_app_settings.sql
-- Phase 4 (Catalog Display & Canonical Export) — the mock/real catalog-source
-- switch and the customer-safe catalog read path. AUTHORED by the build
-- agent per the orchestrator's Denis-approved decision (2026-08-07): the
-- deployed storefront must NOT regress, so it keeps rendering the polished
-- mock catalog (apps/web/src/data/catalog.ts) until an admin flips
-- app_settings.catalog_source to 'real'. This file is authored only — the
-- orchestrator applies it via the Supabase MCP, not this agent.
--
-- Policy call convention (matches every prior migration in this project):
-- using ( (select public.is_admin_or_staff()) ), always `to authenticated`
-- so `anon` short-circuits — EXCEPT section A's read policy, which is a
-- deliberate, explicitly-commented departure (public display config).

------------------------------------------------------------------
-- A. public.app_settings — small admin-editable key/value store for
-- non-sensitive display/runtime config. Same shape as public.pricing_settings
-- (20260806120400 §B) with one deliberate divergence: pricing_settings is
-- staff-only because it encodes margin structure (cost-adjacent);
-- app_settings holds nothing sensitive by contract (display toggles only),
-- so its SELECT policy is public — an anonymous storefront visitor's first
-- paint needs to know mock-vs-real before any session exists.
------------------------------------------------------------------
create table public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

create trigger trg_app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

comment on table public.app_settings is
  'Non-sensitive display/runtime config, admin/staff-editable, PUBLICLY readable by design (see the "app_settings public read" policy below) — never store anything sensitive in this table. Seeded key: catalog_source (jsonb string ''mock''|''real''), gating whether the storefront renders apps/web/src/data/catalog.ts (mock, today''s default — zero visual change) or the real public.catalog_listing + public.variant_price_for_me path. Flip via UPDATE by an admin/staff session once the real catalog has data worth showing.';

alter table public.app_settings enable row level security;

-- Public read — deliberate departure from this repo's usual `to
-- authenticated` convention (01-RESEARCH.md Pattern 1). app_settings holds
-- no sensitive data by contract, and the storefront must be able to decide
-- mock-vs-real on an anonymous visitor's very first paint, before any
-- session exists. Needs BOTH this policy (`to anon, authenticated`) AND the
-- explicit grant below — an RLS policy without a matching grant is still
-- `permission denied`, and a grant without a policy is zero rows.
create policy "app_settings public read" on public.app_settings
  for select to anon, authenticated
  using ( true );

-- Write stays admin/staff only (task requirement: "write admin/staff
-- only"). `for all` also covers select for `authenticated`, which is
-- redundant with the public-read policy above for that role — harmless,
-- RLS OR-combines permissive policies for the same command.
create policy "app_settings admin write" on public.app_settings
  for all to authenticated
  using ( (select public.is_admin_or_staff()) )
  with check ( (select public.is_admin_or_staff()) );

-- select needs an explicit grant because anon has no default table
-- privilege in this project (matches the explicit grants on the five
-- masking views in 20260806120300, issued for the same reason even though
-- `authenticated` already carries the project's default table grant).
-- insert/update/delete need no separate grant here — `authenticated`
-- already carries the default table DML grant this project's every other
-- admin-write table relies on (pricing_settings, tiers, vendor_grade_map,
-- …), with RLS as the sole real gate; anon gets none of those verbs since
-- no policy exists for them.
grant select on public.app_settings to anon, authenticated;

insert into public.app_settings (key, value) values
  ('catalog_source', '"mock"'::jsonb)
on conflict (key) do nothing;

------------------------------------------------------------------
-- B. public.catalog_listing — customer-safe catalog read path
-- (PRODUCT-CATALOG-STANDARD.md §8, PRICING-ENGINE.md §2). One row per
-- variant that is both PUBLISHED and in stock:
--   * "published"  = at least one visible price row exists for it in
--                     public.prices (any tier) — the schema has no separate
--                     `published` boolean (by design, see comment in
--                     20260806120100); a variant nothing has ever priced
--                     and made visible is not sellable to anyone yet, so it
--                     is excluded here rather than rendered with no price
--                     anywhere on the storefront.
--   * "in stock"    = at least one active stock_locations row with qty > 0
--                     (the inner joins below require this; a variant with
--                     zero in-stock locations simply produces no row).
--
-- Column allow-list is deliberate and exhaustive — NEVER `select *`.
-- Deliberately EXCLUDED: pv.grade (raw vendor label, e.g. "DLS B+" —
-- CTLG-01 classifies this admin-side only), pv.carrier_raw, any
-- inventory.unit_cost_cents, and any supplier join/name. The only condition
-- signal exposed is `ctia_label`, a CASE over the CTIA enum — never the raw
-- grade string.
--
-- Price is NOT exposed here. Callers read their own tier's price
-- separately from public.variant_price_for_me (20260807150000), which is
-- authenticated-only and resolves the tier server-side from the caller's
-- own profile — never from a param this view could accept. Conflating the
-- two here would either leak a cost-adjacent signal or force this view to
-- be authenticated-only too, which would kill anonymous storefront
-- browsing (see stock_locations_public's comment in 20260806120300 — anon
-- browsing is the intended Phase 4 path). This view is therefore NOT
-- tier-gated: it lists every published, in-stock variant regardless of
-- which tiers can see a price for it (T3/T4 customers need to see B/C/D
-- grade stock; only the price lookup is tier-scoped).
--
-- Intentionally NOT security_invoker — same rationale as the five masking
-- views in 20260806120300 (products_public, product_variants_public, etc):
-- customers hold no SELECT policy on ANY base table referenced here
-- (products/product_variants/inventory/stock_locations/vendor_grade_map/
-- prices are all staff-only or carry no customer policy at all), so an
-- invoker-rights view would return ZERO ROWS for every customer — reading
-- as "the catalog is empty", not as a security alert. Do not apply the
-- Supabase linter's security_invoker suggestion to this view.
------------------------------------------------------------------
create view public.catalog_listing as
with base as (
  select
    pv.id       as variant_id,
    pv.sku,
    p.make,
    p.model,
    pv.capacity,
    pv.color,
    pv.carrier,
    pv.lock_status,
    -- Same "match on grade label alone, worst-case tiebreak" resolution as
    -- reprice_variants (20260807150000 §"CTIA grade" comment) — kept
    -- consistent so the label shown here always agrees with what actually
    -- gated the price the customer sees via variant_price_for_me. Unmapped
    -- grade -> CTIA C, the same safe default used everywhere else.
    coalesce(g.ctia, 'C'::public.ctia_grade) as ctia_grade
  from public.product_variants pv
  join public.products p on p.id = pv.product_id
  left join lateral (
    select vgm.ctia
    from public.vendor_grade_map vgm
    where upper(trim(vgm.vendor_grade)) = upper(trim(pv.grade))
    order by vgm.ctia desc
    limit 1
  ) g on true
  where exists (
    select 1 from public.prices pr
    where pr.variant_id = pv.id and pr.visible
  )
)
select
  b.variant_id,
  b.sku,
  b.make,
  b.model,
  b.capacity,
  b.color,
  b.carrier,
  b.lock_status,
  b.ctia_grade,
  -- Consumer-facing CTIA label — never the raw vendor grade. Task-specified
  -- mapping for NEW/CPO/A verbatim; B/C/D added so T3/T4 customers (who
  -- legitimately see sub-A stock per PRICING-ENGINE.md §2) get a
  -- customer-safe label too, instead of the row being unlabelable.
  case b.ctia_grade
    when 'NEW' then 'New'
    when 'CPO' then 'Certified Pre-Owned'
    when 'A'   then 'Certified Pre-Owned · Grade A'
    when 'B'   then 'Grade B'
    when 'C'   then 'Grade C'
    when 'D'   then 'Grade D'
  end as ctia_label,
  sum(inv.qty)::integer as total_qty,
  jsonb_agg(
    jsonb_build_object('name', sl.display_name, 'qty', inv.qty)
    order by sl.display_name
  ) as locations
from base b
join public.inventory inv        on inv.variant_id = b.variant_id and inv.qty > 0
join public.stock_locations sl   on sl.id = inv.location_id and sl.active
group by
  b.variant_id, b.sku, b.make, b.model, b.capacity, b.color, b.carrier,
  b.lock_status, b.ctia_grade;

comment on view public.catalog_listing is
  'Customer-safe catalog read path (PRODUCT-CATALOG-STANDARD.md §8, PRICING-ENGINE.md §2) — one row per PUBLISHED (has a visible price at some tier), in-stock variant. Exposes canonical display fields, a CTIA consumer label (never the raw vendor grade), sku, and a per-location {name, qty} breakdown. NEVER exposes unit_cost_cents, carrier_raw, grade, or any supplier identity. Price is deliberately absent — read the caller''s own tier price from public.variant_price_for_me. Intentionally NOT security_invoker — see the inline comment above; do not apply the Supabase linter''s security_invoker suggestion here, it would silently return zero rows for every customer.';

grant select on public.catalog_listing to anon, authenticated;
