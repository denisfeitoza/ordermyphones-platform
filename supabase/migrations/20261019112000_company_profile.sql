-- Company details printed on every Sales Order: legal name, address, the
-- bank details buyers wire/ACH to, and the Transfer Date / Discrepancy
-- Threshold wording from the Master Agreement. One row. Signed-in users read
-- it (buyers need the bank details); only admins edit it. Not in
-- app_settings, which anonymous visitors can read. No real values here —
-- the repo is public; the admin fills them in.
create table public.company_profile (
  id                    smallint primary key default 1 check (id = 1),
  legal_name            text check (length(legal_name) <= 200),
  address               text check (length(address) <= 500),
  phone                 text check (length(phone) <= 60),
  email                 text check (length(email) <= 200),
  website               text check (length(website) <= 200),
  bank_name             text check (length(bank_name) <= 200),
  bank_account_name     text check (length(bank_account_name) <= 200),
  routing_number        text check (length(routing_number) <= 40),
  account_number        text check (length(account_number) <= 60),
  swift                 text check (length(swift) <= 40),
  bank_address          text check (length(bank_address) <= 500),
  payment_notes         text check (length(payment_notes) <= 1000),
  transfer_date_rule    text check (length(transfer_date_rule) <= 1000),
  discrepancy_threshold text check (length(discrepancy_threshold) <= 1000),
  sales_order_footer    text check (length(sales_order_footer) <= 1000),
  updated_at            timestamptz not null default now(),
  updated_by            uuid references public.profiles(id)
);
insert into public.company_profile (id) values (1) on conflict do nothing;

alter table public.company_profile enable row level security;
create policy company_profile_read on public.company_profile for select to authenticated using (true);
create policy company_profile_admin_update on public.company_profile for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
grant select, update on public.company_profile to authenticated;
revoke all on public.company_profile from anon;
