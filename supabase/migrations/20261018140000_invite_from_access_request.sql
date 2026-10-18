-- "Mark invited" becomes "Invite": one transaction creates the tier-scoped
-- invite from the access request's e-mail AND marks the request invited.
-- Before, the admin copied the e-mail into the invite panel by hand and then
-- flipped the status — a failed invite could leave a request marked
-- "invited" with no invite behind it (or the reverse).
--
-- Same gates as create_invite (admin only, e-mail not already a user) plus:
-- the request must still be pending (row-locked, so two admins can't both
-- invite it). E-mail delivery stays off (G-1): the caller shows the link.

create or replace function public.invite_from_access_request(p_request_id uuid, p_tier public.customer_tier)
returns public.invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req    public.access_requests;
  v_invite public.invites;
begin
  if not (select public.is_admin()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_tier is null then
    raise exception 'tier_required' using errcode = 'P0001';
  end if;

  select * into v_req from public.access_requests where id = p_request_id for update;
  if not found then
    raise exception 'request_not_found' using errcode = 'P0001';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'request_not_pending' using errcode = 'P0001', detail = v_req.status;
  end if;
  if exists (select 1 from auth.users u where lower(u.email) = lower(v_req.email)) then
    raise exception 'email_taken' using errcode = '23505';
  end if;

  insert into public.invites (email, tier, invited_by)
  values (lower(btrim(v_req.email)), p_tier, auth.uid())
  returning * into v_invite;

  update public.access_requests
     set status = 'invited', reviewed_at = now(), reviewed_by = auth.uid()
   where id = p_request_id;

  return v_invite;
end;
$$;

revoke all on function public.invite_from_access_request(uuid, public.customer_tier) from public, anon;
grant execute on function public.invite_from_access_request(uuid, public.customer_tier) to authenticated;
