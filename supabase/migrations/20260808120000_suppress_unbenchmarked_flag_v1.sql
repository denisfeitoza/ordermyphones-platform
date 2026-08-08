-- v1: the pricing engine flags a variant 'unbenchmarked' whenever there is no
-- benchmark/manual consumer price yet. Without a market-price data source in
-- v1, that is true for essentially every item — so the flag queue fills with
-- one noise reason instead of actionable signal. Per the owner's call, suppress
-- 'unbenchmarked' at the source with a BEFORE INSERT trigger, so the queue only
-- surfaces real, actionable anomalies (margin floor, tier-order, zero stock,
-- cost swing, spread, collision). Does NOT change price visibility (that is
-- prices.visible, set by the engine), only whether a queue row is created.
-- Reversible: drop the trigger to restore.
create or replace function public.suppress_unbenchmarked_flag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'unbenchmarked'::public.pricing_flag_kind then
    return null; -- drop the insert; not an actionable anomaly in v1
  end if;
  return new;
end;
$$;

drop trigger if exists pricing_flags_suppress_unbenchmarked on public.pricing_flags;
create trigger pricing_flags_suppress_unbenchmarked
  before insert on public.pricing_flags
  for each row execute function public.suppress_unbenchmarked_flag();

update public.pricing_flags
   set status = 'resolved'::public.pricing_flag_status, resolved_at = now()
 where kind = 'unbenchmarked'::public.pricing_flag_kind
   and status = 'open'::public.pricing_flag_status;
