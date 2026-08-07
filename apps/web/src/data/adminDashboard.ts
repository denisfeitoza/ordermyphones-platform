import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface RealAdminSummary {
  skusLive: number;
  openFlags: number;
  customers: number;
}

/**
 * Real operational counts for the admin dashboard (M2 / go-live). Cheap
 * head-count queries — no rows fetched. Orders and reconciliations come from
 * the dedicated real hooks in the component; this covers the counts that don't
 * already have one. All tables are admin/staff-readable under RLS.
 */
export function useRealAdminSummary() {
  return useQuery({
    queryKey: ['admin-summary'],
    queryFn: async (): Promise<RealAdminSummary> => {
      const [skus, flags, customers] = await Promise.all([
        supabase.from('catalog_listing').select('*', { count: 'exact', head: true }),
        supabase.from('pricing_flags').select('*', { count: 'exact', head: true }).eq('status', 'open'),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer'),
      ]);
      return {
        skusLive: skus.count ?? 0,
        openFlags: flags.count ?? 0,
        customers: customers.count ?? 0,
      };
    },
    staleTime: 60_000,
  });
}
