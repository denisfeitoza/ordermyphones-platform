import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * Whether the storefront lets a customer pick which stock location(s) a line is
 * sourced from (M2-P3), read from app_settings.order_location_selection. Like
 * useCatalogSource: `false` is the safe default and the only answer before the
 * network settles (placeholderData), and any error falls back to `false` — so
 * the cart/checkout behave exactly as v1 (system-decides sourcing at approval)
 * unless the flag is explicitly enabled. When OFF the picker UI never renders
 * and place_order receives no location_id, so the whole feature is inert.
 */
export function useOrderLocationSelection(): boolean {
  const query = useQuery({
    queryKey: ['app-settings', 'order_location_selection'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'order_location_selection')
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data?.value as { enabled?: boolean } | null)?.enabled === true;
    },
    placeholderData: false,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  return query.data ?? false;
}
