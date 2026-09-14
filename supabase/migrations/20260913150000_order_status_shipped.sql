-- 20260913150000_order_status_shipped.sql
-- J2 step 5 of the v1.0 plan ("Enviar — marca 'enviado' + tracking manual").
-- Adding an enum value must commit before anything references it, so this
-- migration does only that; 20260913150100_fulfilment.sql adds the columns,
-- the RPC and the view change.
alter type public.order_status add value if not exists 'shipped';
