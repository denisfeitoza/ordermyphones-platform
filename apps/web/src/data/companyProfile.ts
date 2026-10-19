import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/** public.company_profile — what every Sales Order prints (signed-in read, admin edit). */
export interface CompanyProfile {
  legal_name: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  routing_number: string | null;
  account_number: string | null;
  swift: string | null;
  bank_address: string | null;
  payment_notes: string | null;
  transfer_date_rule: string | null;
  discrepancy_threshold: string | null;
  sales_order_footer: string | null;
}

export const COMPANY_FIELDS: (keyof CompanyProfile)[] = [
  'legal_name', 'address', 'phone', 'email', 'website',
  'bank_name', 'bank_account_name', 'routing_number', 'account_number', 'swift', 'bank_address', 'payment_notes',
  'transfer_date_rule', 'discrepancy_threshold', 'sales_order_footer',
];

export function useCompanyProfile(enabled = true) {
  return useQuery({
    queryKey: ['company-profile'],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<CompanyProfile> => {
      const { data, error } = await supabase.from('company_profile').select(COMPANY_FIELDS.join(',')).eq('id', 1).maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? Object.fromEntries(COMPANY_FIELDS.map((f) => [f, null]))) as unknown as CompanyProfile;
    },
  });
}

export function useSaveCompanyProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: CompanyProfile) => {
      const clean = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, typeof v === 'string' && v.trim() === '' ? null : v]));
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from('company_profile').update({ ...clean, updated_at: new Date().toISOString(), updated_by: u.user?.id ?? null }).eq('id', 1);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['company-profile'] }),
  });
}
