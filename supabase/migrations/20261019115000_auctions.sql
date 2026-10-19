-- Auction bid collection (RFC-001 D4/Q2/Q5): staff publish an auction event
-- per supplier list (Verizon, B-Stock, Sumitomo, Rexi…) with the supplier's
-- deadline; the portal closes `close_minutes_before` (default 20) earlier.
-- Wholesale and distributor buyers place BINDING bids (never withdrawn,
-- only raised); a $2,500 deposit gate applies per account unless staff turn
-- it off. Staff see the highest bid per lot and export it for submission.
-- Submission to the auction houses stays manual/export for now.
-- ASSUMPTIONS to confirm with OMP: bids are sealed (a buyer only learns
-- whether they lead), price is per unit unless the event says per lot, a
-- won lot does not create an order automatically, ties go to the earliest bid.

create table public.auction_events (
  id                    uuid primary key default gen_random_uuid(),
  source                text not null check (source in ('verizon', 'bstock', 'sumitomo', 'rexi', 'other')),
  title                 text not null check (length(title) between 1 and 200),
  supplier_deadline     timestamptz not null,
  close_minutes_before  integer not null default 20 check (close_minutes_before between 0 and 1440),
  closes_at             timestamptz not null,
  price_basis           text not null default 'unit' check (price_basis in ('unit', 'lot')),
  status                text not null default 'draft' check (status in ('draft', 'open', 'submitted', 'cancelled')),
  notes                 text check (length(notes) <= 2000),
  created_by            uuid references public.profiles(id),
  created_at            timestamptz not null default now()
);

create or replace function public.auction_events_closes_at()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  new.closes_at := new.supplier_deadline - make_interval(mins => new.close_minutes_before);
  return new;
end;
$$;
create trigger trg_auction_events_closes_at before insert or update on public.auction_events
  for each row execute function public.auction_events_closes_at();

create table public.auction_lots (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.auction_events(id) on delete cascade,
  lot_ref     text not null check (length(lot_ref) between 1 and 80),
  title       text not null check (length(title) between 1 and 300),
  qty         integer check (qty is null or qty between 0 and 1000000),
  grade       text check (length(grade) <= 60),
  details     jsonb not null default '{}' check (length(details::text) <= 8000),
  sort        integer not null default 0,
  unique (event_id, lot_ref)
);
create index auction_lots_event on public.auction_lots (event_id, sort);

create table public.auction_bids (
  id           uuid primary key default gen_random_uuid(),
  lot_id       uuid not null references public.auction_lots(id) on delete cascade,
  account_id   uuid not null references public.profiles(id),
  bidder_id    uuid not null references public.profiles(id),
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 10000000000),
  created_at   timestamptz not null default now()
);
create index auction_bids_lot on public.auction_bids (lot_id, amount_cents desc, created_at);
create index auction_bids_account on public.auction_bids (account_id, lot_id);
create trigger trg_auction_bids_append_only before update or delete on public.auction_bids
  for each row execute function public.deny_ledger_mutation();

-- Who may bid: the account owner's tier is wholesale or distributor.
create or replace function public.can_view_auctions()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select public.is_admin_or_staff() or exists (
    select 1 from public.profiles o
     where o.id = public.current_account_id() and o.tier in ('wholesale', 'distributor'))
$$;

alter table public.auction_events enable row level security;
alter table public.auction_lots enable row level security;
alter table public.auction_bids enable row level security;
create policy auction_events_read on public.auction_events for select to authenticated
  using ((select public.is_admin_or_staff()) or (status in ('open', 'submitted') and (select public.can_view_auctions())));
create policy auction_events_staff_write on public.auction_events for all to authenticated
  using ((select public.is_admin_or_staff())) with check ((select public.is_admin_or_staff()));
create policy auction_lots_read on public.auction_lots for select to authenticated
  using ((select public.is_admin_or_staff())
         or ((select public.can_view_auctions())
             and exists (select 1 from public.auction_events e where e.id = event_id and e.status in ('open', 'submitted'))));
create policy auction_lots_staff_write on public.auction_lots for all to authenticated
  using ((select public.is_admin_or_staff())) with check ((select public.is_admin_or_staff()));
-- Bids are sealed: a buyer reads only its own account's bids.
create policy auction_bids_read on public.auction_bids for select to authenticated
  using (account_id = (select public.current_account_id()) or (select public.is_admin_or_staff()));
grant select, insert, update, delete on public.auction_events to authenticated;
grant select, insert, update, delete on public.auction_lots to authenticated;
grant select on public.auction_bids to authenticated;
revoke all on public.auction_events, public.auction_lots, public.auction_bids from anon;

create or replace function public.place_bid(p_lot_id uuid, p_amount_cents bigint)
returns public.auction_bids
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_acct  uuid := public.current_account_id();
  v_tier  text;
  v_ev    public.auction_events;
  v_terms public.account_terms;
  v_prev  bigint;
  v_row   public.auction_bids;
begin
  if v_uid is null or v_acct is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select tier::text into v_tier from public.profiles where id = v_acct;
  if v_tier not in ('wholesale', 'distributor') then raise exception 'auction_tier_only' using errcode = '42501'; end if;
  select e.* into v_ev from public.auction_events e join public.auction_lots l on l.event_id = e.id where l.id = p_lot_id;
  if not found then raise exception 'lot_not_found' using errcode = 'P0001'; end if;
  if v_ev.status <> 'open' or now() >= v_ev.closes_at then raise exception 'auction_closed' using errcode = 'P0001'; end if;
  select * into v_terms from public.account_terms where account_id = v_acct;
  if coalesce(v_terms.auction_deposit_required, true) and coalesce(v_terms.auction_deposit_received_cents, 0) < 250000 then
    raise exception 'deposit_required' using errcode = 'P0001';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 10000000000 then
    raise exception 'bad_bid' using errcode = 'P0001';
  end if;
  -- Serialize this account's bids on the lot, then only allow a raise.
  perform pg_advisory_xact_lock(hashtextextended(v_acct::text || p_lot_id::text, 0));
  select max(amount_cents) into v_prev from public.auction_bids where lot_id = p_lot_id and account_id = v_acct;
  if v_prev is not null and p_amount_cents <= v_prev then
    raise exception 'bid_must_increase' using errcode = 'P0001', detail = v_prev::text;
  end if;
  insert into public.auction_bids (lot_id, account_id, bidder_id, amount_cents)
  values (p_lot_id, v_acct, v_uid, p_amount_cents) returning * into v_row;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, payload)
  values (v_uid, 'auction_bid', 'auction_lots', p_lot_id, jsonb_build_object('event_id', v_ev.id, 'amount_cents', p_amount_cents, 'account_id', v_acct));
  return v_row;
end;
$$;

-- The buyer's own position per lot of an event: own top bid and whether it
-- currently leads (earliest wins a tie). Never returns anyone else's amount.
create or replace function public.my_auction_standing(p_event_id uuid)
returns table (lot_id uuid, my_bid_cents bigint, is_leading boolean)
language sql
stable
security definer
set search_path to ''
as $$
  with mine as (
    select b.lot_id, max(b.amount_cents) as amt
      from public.auction_bids b join public.auction_lots l on l.id = b.lot_id
     where l.event_id = p_event_id and b.account_id = public.current_account_id()
     group by b.lot_id
  ), best as (
    select distinct on (b.lot_id) b.lot_id, b.account_id
      from public.auction_bids b join public.auction_lots l on l.id = b.lot_id
     where l.event_id = p_event_id
     order by b.lot_id, b.amount_cents desc, b.created_at asc
  )
  select m.lot_id, m.amt, (bt.account_id = public.current_account_id())
    from mine m join best bt on bt.lot_id = m.lot_id
   where public.can_view_auctions()
$$;

-- Staff: highest bid per lot (ties: earliest), with the bidder.
create or replace function public.auction_results(p_event_id uuid)
returns table (lot_id uuid, lot_ref text, title text, qty integer, grade text, amount_cents bigint, bid_at timestamptz,
               account_id uuid, account_email text, account_name text, bid_count bigint)
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if not public.is_admin_or_staff() then raise exception 'staff_only' using errcode = '42501'; end if;
  return query
  select l.id, l.lot_ref, l.title, l.qty, l.grade, w.amount_cents, w.created_at, w.account_id, p.email,
         coalesce(bp.legal_name, p.display_name), (select count(*) from public.auction_bids c where c.lot_id = l.id)
    from public.auction_lots l
    left join lateral (
      select b.amount_cents, b.created_at, b.account_id from public.auction_bids b
       where b.lot_id = l.id order by b.amount_cents desc, b.created_at asc limit 1
    ) w on true
    left join public.profiles p on p.id = w.account_id
    left join public.business_profiles bp on bp.account_id = w.account_id
   where l.event_id = p_event_id
   order by l.sort, l.lot_ref;
end;
$$;

-- Staff record a deposit wire (adds to what was received; negative refunds).
create or replace function public.record_auction_deposit(p_account_id uuid, p_delta_cents bigint, p_note text default null)
returns public.account_terms
language plpgsql
security definer
set search_path to ''
as $$
declare v_uid uuid := auth.uid(); v_owner uuid; v_row public.account_terms;
begin
  if v_uid is null or not public.is_admin_or_staff() then raise exception 'staff_only' using errcode = '42501'; end if;
  select coalesce(parent_account_id, id) into v_owner from public.profiles where id = p_account_id and role = 'customer';
  if v_owner is null then raise exception 'customer_not_found' using errcode = 'P0001'; end if;
  if p_delta_cents is null or p_delta_cents = 0 or abs(p_delta_cents) > 100000000 then raise exception 'bad_amount' using errcode = 'P0001'; end if;
  insert into public.account_terms (account_id, auction_deposit_received_cents, updated_at, updated_by)
  values (v_owner, greatest(0, p_delta_cents), now(), v_uid)
  on conflict (account_id) do update
    set auction_deposit_received_cents = greatest(0, public.account_terms.auction_deposit_received_cents + p_delta_cents),
        updated_at = now(), updated_by = v_uid
  returning * into v_row;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, payload)
  values (v_uid, 'auction_deposit', 'profiles', v_owner, jsonb_build_object('delta_cents', p_delta_cents, 'balance_cents', v_row.auction_deposit_received_cents, 'note', nullif(btrim(p_note), '')));
  return v_row;
end;
$$;

revoke all on function public.can_view_auctions() from public, anon;
revoke all on function public.place_bid(uuid, bigint) from public, anon;
revoke all on function public.my_auction_standing(uuid) from public, anon;
revoke all on function public.auction_results(uuid) from public, anon;
revoke all on function public.record_auction_deposit(uuid, bigint, text) from public, anon;
grant execute on function public.can_view_auctions() to authenticated;
grant execute on function public.place_bid(uuid, bigint) to authenticated;
grant execute on function public.my_auction_standing(uuid) to authenticated;
grant execute on function public.auction_results(uuid) to authenticated;
grant execute on function public.record_auction_deposit(uuid, bigint, text) to authenticated;
