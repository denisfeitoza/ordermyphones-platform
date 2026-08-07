-- 20260807191000_profile_contact.sql
-- Phase 5 (Three-Gate Registration) — G1 storage.
--
-- Gate G1 (REGISTRATION-FIELDS.md): shipping address + contact phone are
-- required before the first order and captured inline at checkout, then saved
-- to the profile. `profiles.phone` already exists (20260806120000) and is
-- already customer-writable; the shipping address does NOT exist yet, so add it
-- here as jsonb ({street, city, state, zip, ...} — free-form so the checkout
-- form owns the shape without a schema change per field).
--
-- CRITICAL: the foundation migration did `revoke update ... from authenticated`
-- then granted UPDATE only on (display_name, phone, locale). Adding a column
-- without a matching column-grant means a customer's checkout save silently
-- fails with 403 while every local test passes. The grant below is what makes
-- G1's "save to profile" actually work — RLS already scopes the row to self
-- ("profiles update self" in 20260806120000), so this only widens the column
-- allow-list, not the row scope.
--
-- AUTHORED ONLY — applied by the orchestrator via MCP.

alter table public.profiles
  add column if not exists shipping_address jsonb;

comment on column public.profiles.shipping_address is
  'Gate G1 (REGISTRATION-FIELDS.md): delivery address captured at first checkout. Free-form jsonb (e.g. {"street","city","state","zip"}) so the checkout form owns the shape. Owner-writable (see the column grant in 20260807191000); RLS scopes the row to the owner via the "profiles update self" policy.';

-- Widen the authenticated column allow-list to include shipping_address.
-- display_name/phone/locale were already granted in 20260806120000; re-granting
-- them here is harmless (idempotent) and keeps the full owner-writable set
-- visible in one place.
grant update (display_name, phone, locale, shipping_address) on public.profiles to authenticated;
