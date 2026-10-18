import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type CatalogSource = 'mock' | 'real';

async function fetchCatalogSource(): Promise<CatalogSource> {
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', 'catalog_source').maybeSingle();
  if (error) throw new Error(error.message);
  return data?.value === 'real' ? 'real' : 'mock';
}

function useCatalogSourceQuery() {
  return useQuery({
    queryKey: ['app-settings', 'catalog_source'],
    queryFn: fetchCatalogSource,
    placeholderData: 'mock',
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

/**
 * Gates the storefront's catalog data source. `'mock'` is the deployed
 * default and the ONLY answer this hook may return before the network
 * settles — `placeholderData` makes that synchronous, so first paint is
 * byte-identical to today with zero dependency on the request resolving.
 * Any error (RLS misconfig, offline, table not migrated yet) also falls
 * back to `'mock'` rather than surfacing a loading/error state on the
 * storefront's home page.
 */
export function useCatalogSource(): CatalogSource {
  return useCatalogSourceQuery().data ?? 'mock';
}

/**
 * True only once the server has actually answered 'mock'. Demo-only widgets
 * (fake products, fake prices) gate on this instead of useCatalogSource(), so
 * they never flash on the live store while the setting is still loading and
 * never appear when the request fails.
 */
export function useIsDemoCatalogConfirmed(): boolean {
  const q = useCatalogSourceQuery();
  return q.isSuccess && !q.isPlaceholderData && q.data === 'mock';
}
