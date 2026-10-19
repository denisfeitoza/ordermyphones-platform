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
    // The store runs on the real catalog; a slow or failed settings request
    // must never swap in the demo catalog (fake products, and a demo checkout
    // that pretends to place orders). Retry a few times instead of giving up.
    placeholderData: 'real',
    staleTime: 5 * 60 * 1000,
    retry: 3,
  });
}

/**
 * Gates the storefront's catalog data source. Production runs 'real', so
 * that is the answer before the network settles and on any error: the live
 * store never falls back to the demo catalog. Only a successful 'mock'
 * answer from app_settings switches the site to demo mode.
 */
export function useCatalogSource(): CatalogSource {
  return useCatalogSourceQuery().data ?? 'real';
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
