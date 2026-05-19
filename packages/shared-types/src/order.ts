export type OrderStatus =
  | 'draft'
  | 'pending_payment'
  | 'paid'
  | 'fulfilling'
  | 'shipped'
  | 'delivered'
  | 'canceled'
  | 'refunded';

export interface OrderItem {
  id: string;
  orderId: string;
  variantId: string;
  qty: number;
  unitPriceCents: number;
  supplierId: string;
}

export interface Order {
  id: string;
  accountId: string;
  placedByUserId: string;
  status: OrderStatus;
  tierIdAtOrder: string;
  subtotalCents: number;
  taxCents: number;
  shippingCents: number;
  totalCents: number;
  currency: 'USD';
  stripeSessionId: string | null;
  stripePaymentIntentId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}
