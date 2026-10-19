-- Auctions are outside the signed Agreement (§1, Schedule A): switched off
-- until a Change Order (§8) is signed. Non-destructive: tables, data and
-- functions stay; only the API can no longer call them. To turn back on,
-- re-grant execute to authenticated and set AUCTIONS_ENABLED in
-- apps/web/src/lib/features.ts.
revoke execute on function public.place_bid(uuid, bigint) from authenticated;
revoke execute on function public.my_auction_standing(uuid) from authenticated;
revoke execute on function public.auction_results(uuid) from authenticated;
revoke execute on function public.record_auction_deposit(uuid, bigint, text) from authenticated;
