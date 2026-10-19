/**
 * Payment terms, payment state and shipping fields shared by the admin and
 * the portal order views (orders.* columns from 20261019110000_payment_terms).
 */
export type PaymentTerms = 'cod' | 'cia' | 'net7' | 'net10' | 'net15' | 'net30';
export type ShippingMethod = 'omp' | 'customer_account' | 'customer_label';
export type ShippingStage = 'none' | 'awaiting_label' | 'label_received';

export const PAYMENT_TERMS: PaymentTerms[] = ['cia', 'cod', 'net7', 'net10', 'net15', 'net30'];

export const TERMS_LABEL: Record<PaymentTerms, string> = {
  cia: 'Cash in advance (ACH/wire)',
  cod: 'Cash on delivery',
  net7: 'Net 7',
  net10: 'Net 10',
  net15: 'Net 15',
  net30: 'Net 30',
};

export const SHIPPING_LABEL: Record<ShippingMethod, string> = {
  omp: 'OMP ships (shipping billed)',
  customer_account: 'Your carrier account',
  customer_label: 'You send the label after we pack',
};

export interface OrderPaymentFields {
  paymentTerms: PaymentTerms | null;
  paymentStatus: 'unpaid' | 'paid';
  invoicedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
  paymentReference: string | null;
  shippingMethod: ShippingMethod;
  shippingAccount: { carrier: string; account_number: string } | null;
  shippingCents: number;
  shippingStage: ShippingStage;
  package: { length_in?: number; width_in?: number; height_in?: number; weight_lb?: number; boxes?: number } | null;
  labelPath: string | null;
}

/** Column list for PostgREST selects, in the same order as the mapper below. */
export const ORDER_PAYMENT_COLUMNS =
  'payment_terms, payment_status, invoiced_at, due_at, paid_at, payment_reference, shipping_method, shipping_account, shipping_cents, shipping_stage, package, label_path';

export interface RawOrderPaymentFields {
  payment_terms: PaymentTerms | null;
  payment_status: 'unpaid' | 'paid' | null;
  invoiced_at: string | null;
  due_at: string | null;
  paid_at: string | null;
  payment_reference: string | null;
  shipping_method: ShippingMethod | null;
  shipping_account: { carrier: string; account_number: string } | null;
  shipping_cents: number | null;
  shipping_stage: ShippingStage | null;
  package: OrderPaymentFields['package'];
  label_path: string | null;
}

export function mapPaymentFields(r: RawOrderPaymentFields): OrderPaymentFields {
  return {
    paymentTerms: r.payment_terms ?? null,
    paymentStatus: r.payment_status ?? 'unpaid',
    invoicedAt: r.invoiced_at ?? null,
    dueAt: r.due_at ?? null,
    paidAt: r.paid_at ?? null,
    paymentReference: r.payment_reference ?? null,
    shippingMethod: r.shipping_method ?? 'omp',
    shippingAccount: r.shipping_account ?? null,
    shippingCents: Number(r.shipping_cents ?? 0),
    shippingStage: r.shipping_stage ?? 'none',
    package: r.package ?? null,
    labelPath: r.label_path ?? null,
  };
}

export type PaymentState = 'not_invoiced' | 'unpaid' | 'overdue' | 'paid';

/** Only approved / partially approved / shipped orders are invoiced. */
export function paymentState(o: Pick<OrderPaymentFields, 'paymentStatus' | 'invoicedAt' | 'dueAt'> & { status: string }, now = Date.now()): PaymentState {
  if (!['approved', 'partially_approved', 'shipped'].includes(o.status) || !o.invoicedAt) return 'not_invoiced';
  if (o.paymentStatus === 'paid') return 'paid';
  if (o.dueAt && Date.parse(o.dueAt) < now) return 'overdue';
  return 'unpaid';
}

export const PAYMENT_STATE_STYLE: Record<PaymentState, { label: string; cls: string }> = {
  not_invoiced: { label: 'Not invoiced', cls: 'bg-muted text-muted-foreground' },
  unpaid: { label: 'Unpaid', cls: 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300' },
  overdue: { label: 'Overdue', cls: 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300' },
  paid: { label: 'Paid', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300' },
};
