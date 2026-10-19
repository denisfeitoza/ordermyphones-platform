-- rate_limit_hits had RLS with no policy (deny-all). Writes stay inside the
-- SECURITY DEFINER hit_rate_limit(); this lets staff read the hits to look at
-- abuse, and keeps the rule that every RLS table has an explicit policy.
drop policy if exists rate_limit_hits_staff_read on public.rate_limit_hits;
create policy rate_limit_hits_staff_read on public.rate_limit_hits
  for select to authenticated
  using ((select public.is_admin_or_staff()));
