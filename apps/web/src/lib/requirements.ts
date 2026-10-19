/** order_requirements_missing / order_credit_problems keys → readable English (translated with t()). */
export const REQUIREMENT_LABEL: Record<string, string> = {
  tax_certificate: 'Tax certificate',
  business_name: 'Business name',
  shipping_address: 'Shipping address',
  credit_limit_missing: 'A credit limit (staff sets it for COD/Net terms)',
  credit_limit_exceeded: 'Room in the credit limit',
  overdue_invoices: 'Paying the overdue invoices',
  master_agreement: 'Signed Master Agreement',
  business_profile: 'Completed business profile',
};
