-- image_assets was created after 20261018200000 changed the default
-- privileges, so authenticated got no table grants at all. Grant them; the
-- staff-only RLS policies still decide who can actually read or write.
grant select, insert, update, delete on public.image_assets to authenticated;

-- Same gap on rate_limit_hits: its staff read policy had no grant behind it.
grant select on public.rate_limit_hits to authenticated;
