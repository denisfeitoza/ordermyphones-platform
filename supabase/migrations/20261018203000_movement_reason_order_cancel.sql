-- New ledger reason for stock put back when an approved order is cancelled.
-- Separate migration: a new enum value cannot be used in the transaction that adds it.
alter type public.movement_reason add value if not exists 'order_cancel';
