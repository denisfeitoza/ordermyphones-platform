-- 20260917120000_shipping_fedex.sql
-- FedEx integration, step 1 of the SHIPMENT-TRACKING.md plan: live tracking
-- status + rate quotes. v1 kept shipping fully manual (staff typed carrier +
-- tracking, see 20260913150100_fulfilment.sql); this adds the data the two
-- edge functions need, and nothing else changes about ordering:
--
--   * rate quotes are an ESTIMATE shown at checkout and to staff — the order
--     total is still computed server-side from tier prices alone (D4/D8), so
--     no shipping is charged and place_order is untouched;
--   * tracking rows are written ONLY by the fedex-track edge function
--     (service role); customers and staff read them.

------------------------------------------------------------------
-- A. Warehouse origin address — required to ask FedEx for a rate.
-- `region` already existed as a free-text label; these are the structured
-- fields the Rate API needs (postal code + country are the minimum).
------------------------------------------------------------------
alter table public.stock_locations
  add column if not exists city         text,
  add column if not exists state_code   text,
  add column if not exists postal_code  text,
  add column if not exists country_code text not null default 'US';

comment on column public.stock_locations.postal_code is
  'Origin postal code for carrier rate quotes (FedEx Rate API). Null = this location cannot be quoted; the rate function skips it.';
comment on column public.stock_locations.country_code is
  'ISO-2 country of the warehouse, for carrier APIs. Defaults to US.';

-- Customer-safe view: deliberately NOT extended with the address. Quotes are
-- computed server-side by the edge function, so the storefront never needs a
-- warehouse address (masking invariant of catalog_listing / stock_locations_public).

------------------------------------------------------------------
-- B. shipment_tracking — normalized carrier status per order.
-- One row per order (v1 ships an order as a single parcel set under one
-- tracking number, the same shape staff already type in the ship dialog).
------------------------------------------------------------------
create table if not exists public.shipment_tracking (
  order_id        uuid primary key references public.orders(id) on delete cascade,
  carrier         text not null,
  tracking_number text not null,
  -- Normalized status vocabulary from docs/integrations/SHIPMENT-TRACKING.md §2,
  -- plus out_for_delivery (FedEx reports it) and unknown (carrier has no scan yet).
  status          text not null default 'queued'
                    check (status in ('queued','in_transit','out_for_delivery','delivered','exception','returned','unknown')),
  status_detail   text,
  estimated_at    timestamptz,
  delivered_at    timestamptz,
  last_event_at   timestamptz,
  -- Newest-first scan list as returned by the carrier, normalized to
  -- {at, status, description, location}. Raw carrier payload is not kept.
  events          jsonb not null default '[]'::jsonb,
  polled_at       timestamptz,
  poll_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists shipment_tracking_status_idx on public.shipment_tracking(status, polled_at);

comment on table public.shipment_tracking is
  'Carrier tracking state per order, refreshed by the fedex-track edge function. Written by service role only; read by the order owner, its account owner, and staff.';

drop trigger if exists trg_shipment_tracking_set_updated_at on public.shipment_tracking;
create trigger trg_shipment_tracking_set_updated_at
  before update on public.shipment_tracking
  for each row execute function public.set_updated_at();

alter table public.shipment_tracking enable row level security;

-- Mirrors "orders own read" (20260913130000 §G5): owner, its sub-accounts'
-- parent, and staff. No insert/update/delete policy: the edge function writes
-- with the service role, which bypasses RLS.
drop policy if exists "shipment tracking own read" on public.shipment_tracking;
create policy "shipment tracking own read" on public.shipment_tracking for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = shipment_tracking.order_id
        and (
          o.customer_id = (select auth.uid())
          or (select public.is_admin_or_staff())
          or o.customer_id in (select c.id from public.profiles c where c.parent_account_id = (select auth.uid()))
        )
    )
  );

------------------------------------------------------------------
-- C. Package defaults for rate quotes (admin-editable, non-sensitive).
-- A graded phone ships in a small padded box; weight scales with units and is
-- capped into parcels of `units_per_box` so a 300-unit order quotes as pallets
-- of parcels rather than one impossible package.
------------------------------------------------------------------
insert into public.app_settings (key, value)
values ('shipping_package_defaults', jsonb_build_object(
  'unit_weight_lb', 0.6,
  'box_weight_lb', 0.4,
  'units_per_box', 20,
  'box_inches', jsonb_build_object('length', 14, 'width', 10, 'height', 8)
))
on conflict (key) do nothing;
