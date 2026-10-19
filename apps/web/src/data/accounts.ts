import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { PaymentTerms } from '@/lib/payment';

/** public.account_terms — staff write, the account reads its own. Keyed by account owner. */
export interface AccountTerms {
  accountId: string;
  paymentTerms: PaymentTerms;
  creditLimitCents: number | null;
  auctionDepositRequired: boolean;
  auctionDepositReceivedCents: number;
  updatedAt: string | null;
}

interface RawTerms {
  account_id: string;
  payment_terms: PaymentTerms;
  credit_limit_cents: number | null;
  auction_deposit_required: boolean;
  auction_deposit_received_cents: number;
  updated_at: string | null;
}

const mapTerms = (r: RawTerms): AccountTerms => ({
  accountId: r.account_id,
  paymentTerms: r.payment_terms,
  creditLimitCents: r.credit_limit_cents === null ? null : Number(r.credit_limit_cents),
  auctionDepositRequired: r.auction_deposit_required,
  auctionDepositReceivedCents: Number(r.auction_deposit_received_cents),
  updatedAt: r.updated_at,
});

/** Every account's terms (staff), keyed by account id. Accounts without a row use the defaults. */
export function useAllAccountTerms() {
  return useQuery({
    queryKey: ['account-terms'],
    queryFn: async (): Promise<Map<string, AccountTerms>> => {
      const { data, error } = await supabase.from('account_terms').select('*');
      if (error) throw new Error(error.message);
      return new Map(((data ?? []) as RawTerms[]).map((r) => [r.account_id, mapTerms(r)]));
    },
  });
}

export function useSetAccountTerms() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { accountId: string; terms: PaymentTerms; creditLimitCents: number | null; depositRequired: boolean }) => {
      const { error } = await supabase.rpc('set_account_terms', {
        p_account_id: v.accountId,
        p_terms: v.terms,
        p_credit_limit_cents: v.creditLimitCents,
        p_deposit_required: v.depositRequired,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['account-terms'] }),
  });
}

export interface MyAccountSummary {
  paymentTerms: PaymentTerms;
  creditLimitCents: number | null;
  openBalanceCents: number;
  overdueCents: number;
  auctionDepositRequired: boolean;
  auctionDepositReceivedCents: number;
}

/** The signed-in buyer's terms, credit limit, open balance and overdue amount. */
export function useMyAccountSummary(enabled = true) {
  return useQuery({
    queryKey: ['my-account-summary'],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<MyAccountSummary> => {
      const { data, error } = await supabase.rpc('my_account_summary');
      if (error) throw new Error(error.message);
      const r = data as Record<string, unknown>;
      return {
        paymentTerms: (r.payment_terms as PaymentTerms) ?? 'cia',
        creditLimitCents: r.credit_limit_cents === null || r.credit_limit_cents === undefined ? null : Number(r.credit_limit_cents),
        openBalanceCents: Number(r.open_balance_cents ?? 0),
        overdueCents: Number(r.overdue_cents ?? 0),
        auctionDepositRequired: r.auction_deposit_required !== false,
        auctionDepositReceivedCents: Number(r.auction_deposit_received_cents ?? 0),
      };
    },
  });
}
