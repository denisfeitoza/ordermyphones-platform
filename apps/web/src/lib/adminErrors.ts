/** Postgres/RPC error codes raised by the order RPCs → readable admin text (English source, translated with t()). */
const MESSAGES: [string, string][] = [
  ['order_not_pending', 'This order was already decided. Refresh the list.'],
  ['order_not_found', 'This order no longer exists. Refresh the list.'],
  ['order_not_cancellable', 'This order can no longer be cancelled (it shipped or was already closed).'],
  ['order_not_approved', 'Only approved orders can be shipped.'],
  ['staff_only', 'Only staff or admins can do this.'],
  ['admin_only', 'Only an admin can do this.'],
  ['not_authorized', 'Only an admin can do this.'],
  ['bad_location', 'A chosen warehouse is no longer active.'],
  ['bad_price', 'Every line needs a price above zero.'],
  ['bad_qty', 'Every line needs a quantity above zero.'],
  ['empty_order', 'An order needs at least one line.'],
  ['open_shortfall', 'This order has open shortfalls. Ship it from its detail panel to close them.'],
  ['nothing_to_ship', 'Nothing was approved on this order, so there is nothing to ship.'],
  ['requirements_missing', 'The customer is missing required details. Approve it from its detail panel.'],
  ['consumer_is_manual', 'Consumer prices are always set by hand; edit the number instead.'],
  ['not_manual', 'This price is already automatic. Refresh the list.'],
  ['note_required', 'Write a short reason (up to 500 characters).'],
  ['inventory_not_found', 'This stock line no longer exists. Refresh the list.'],
];

export function adminErrorMessage(t: (s: string) => string, message: string | undefined | null): string {
  const m = message ?? '';
  const hit = MESSAGES.find(([code]) => m.includes(code));
  return hit ? t(hit[1]) : m || t('Action failed.');
}
