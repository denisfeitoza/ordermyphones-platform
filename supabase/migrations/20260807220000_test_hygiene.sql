-- 20260807220000_test_hygiene.sql
-- Phase 8 (Launch Readiness). Three launch-gate closers, no schema rewrites:
--
--   A. public.reset_test_data() — admin-only, ZERO-parameter cleanup that
--      removes every is_test order (order_items + reconciliation_queue cascade)
--      and REVERSES their inventory deductions with compensating ledger
--      movements. It never touches profiles, and its only row-selecting
--      predicate is `orders.is_test = true` — there is no code path that can
--      narrow or widen that scope (no p_order_ids, no p_include_real). That is
--      the structural proof that it cannot delete real data.
--
--   B. Reports exclude test rows by default — app_settings key
--      'reports_include_test' (jsonb false) + a security_invoker view
--      public.orders_reportable that filters is_test orders unless the flag is
--      flipped. (The current admin ReportsPage renders MOCK data; this is the
--      single source of truth the real report reader will consume when reports
--      move off the mock — same "written now, read side follows" posture as the
--      Phase 7 catalog_qty_display / enforcement_points keys.)
--
--   C. Classify the carried-forward orphan grade "TPS A-" (HYLA) to CTIA A —
--      matching the TPS A+/TPS A -> A family (LNCH-02). Config-backed default:
--      an admin can re-map it any time in the Phase-7 Grades tab
--      (resolve_grade_classification upserts the same row). See
--      docs/planning/AUTONOMOUS-DECISIONS.md.
--
-- WHY compensating movements and not DELETE of the ledger rows:
-- public.stock_movements is append-only, enforced by
-- trg_stock_movements_append_only (20260806120200 §D), which raises 42501 on
-- UPDATE/DELETE for the table OWNER and service_role too — deliberately. That
-- migration's own comment settles the choice: "a genuine correction is a
-- compensating movement; a genuine schema repair drops this trigger
-- deliberately in its own migration." This is not a schema repair, so the
-- trigger stays; we reverse the balance with new movements. The brief's word
-- "delete movements" was written without knowledge of that trigger.

------------------------------------------------------------------
-- A. public.reset_test_data()
------------------------------------------------------------------
create or replace function public.reset_test_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
-- Bounded so a large test book can't pin a PostgREST worker; a timeout aborts
-- and rolls the whole reset back atomically (safe failure mode).
set statement_timeout = '60s'
as $$
declare
  v_uid            uuid := auth.uid();
  v_orders_deleted integer := 0;
  v_recon_deleted  integer := 0;
  v_comp_movements integer := 0;
begin
  if not (select public.is_admin()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- 1. Reverse the inventory impact of every test-order deduction FIRST — once
  --    the orders are deleted the movement->order link (a bare, FK-less
  --    ref_id) is unrecoverable. The predicate is doubly constrained:
  --      * ref_type = 'orders' AND ref_id in (test orders), and
  --      * reason in ('order_approval','reconciliation') — the only two
  --        order-writing reasons (20260807200000, lines 234 & 400), so a stray
  --        non-order writer that ever reused ref_type='orders' can't be caught.
  --    Net-zero pairs are skipped (the ledger's delta<>0 check would abort the
  --    insert otherwise).
  --
  --    DELIBERATE SEMANTIC: this restores inventory "as if the test order never
  --    deducted". If the same units were re-imported in replace mode after the
  --    test deduction, the compensation can push inventory.qty above the
  --    current physical count. That is the honest reversal of a test action and
  --    is accepted for a test-data reset; documented in AUTONOMOUS-DECISIONS.
  with test_moves as (
    select sm.variant_id, sm.location_id, sum(sm.delta) as net
    from public.stock_movements sm
    where sm.ref_type = 'orders'
      and sm.reason in ('order_approval', 'reconciliation')
      and sm.ref_id in (select id from public.orders where is_test = true)
    group by sm.variant_id, sm.location_id
    having sum(sm.delta) <> 0
  ),
  comp as (
    insert into public.stock_movements
      (variant_id, location_id, delta, reason, ref_type, ref_id, actor_id, note)
    select variant_id, location_id, -net, 'manual_adjust', 'test_reset', null, v_uid,
           'reset_test_data: reverse test-order deduction'
    from test_moves
    returning 1
  )
  select count(*) into v_comp_movements from comp;

  -- 2. Count the reconciliation rows that will cascade away (for the audit
  --    detail only — the delete below removes them via FK cascade).
  select count(*) into v_recon_deleted
  from public.reconciliation_queue rq
  join public.order_items oi on oi.id = rq.order_item_id
  join public.orders o       on o.id = oi.order_id
  where o.is_test = true;

  -- 3. Delete the test orders. order_items cascade (on delete cascade,
  --    20260806120500), reconciliation_queue cascades from order_items.
  --    public.profiles is never referenced by any DELETE here.
  delete from public.orders where is_test = true;
  get diagnostics v_orders_deleted = row_count;

  insert into public.admin_audit (actor_id, action, detail)
  values (v_uid, 'reset_test_data',
          jsonb_build_object('orders_deleted', v_orders_deleted,
                             'reconciliation_deleted', v_recon_deleted,
                             'compensating_movements', v_comp_movements));

  return jsonb_build_object('orders_deleted', v_orders_deleted,
                            'reconciliation_deleted', v_recon_deleted,
                            'compensating_movements', v_comp_movements);
end;
$$;

comment on function public.reset_test_data() is
  'Admin-only, zero-parameter test-data cleanup. Deletes every orders row with is_test=true (order_items + reconciliation_queue cascade) and writes compensating manual_adjust movements that reverse those orders'' inventory deductions (the ledger is append-only, so it is corrected, not edited). Never touches profiles or any is_test=false row. Idempotent: a second call finds no test orders and does nothing. The compensation can lift inventory.qty above the physical count if units were re-imported after a test deduction — the honest reversal of a test action. Audited to admin_audit.';

revoke execute on function public.reset_test_data() from public, anon;
grant  execute on function public.reset_test_data() to authenticated;

------------------------------------------------------------------
-- B. Reports exclude test rows by default
------------------------------------------------------------------
insert into public.app_settings (key, value) values
  ('reports_include_test', 'false'::jsonb)
on conflict (key) do nothing;

-- security_invoker=true is REQUIRED: without it the view would run with the
-- owner's rights and bypass orders' RLS, letting a customer read every order.
-- With it, orders' RLS applies to the caller (admin/staff see all, a customer
-- sees only their own), and this view just layers the test-exclusion on top.
create or replace view public.orders_reportable
  with (security_invoker = true) as
select o.*
from public.orders o
where o.is_test = false
   or coalesce(
        (select value = 'true'::jsonb
         from public.app_settings
         where key = 'reports_include_test'),
        false);

comment on view public.orders_reportable is
  'Reporting projection over public.orders that excludes is_test orders unless app_settings.reports_include_test is true. security_invoker so the caller''s RLS on orders still applies. Single source of truth for the reports read side once it moves off the mock ReportsPage.';

grant select on public.orders_reportable to authenticated;

------------------------------------------------------------------
-- C. Classify the orphan grade "TPS A-" (HYLA) -> CTIA A
-- Default only: `do nothing` so an admin re-classification in the Phase-7
-- Grades tab (resolve_grade_classification, which upserts this same row) is
-- never clobbered by a re-run of this migration. Seeding the map here means a
-- future real HYLA import resolves the grade via omp_grade_to_ctia and never
-- routes it to grade_classification_queue.
------------------------------------------------------------------
insert into public.vendor_grade_map (vendor_code, vendor_grade, ctia) values
  ('HYLA', 'TPS A-', 'A')
on conflict (vendor_code, vendor_grade) do nothing;
