import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/** One product and what it still needs (RPC product_health, staff-only). */
export interface ProductHealth {
  id: string;
  make: string;
  model: string;
  modelNumber: string;
  category: string;
  published: boolean;
  createdAt: string;
  imageUrl: string | null;
  imageApprox: boolean;
  variants: number;
  stockUnits: number;
  pricedVariants: number;
  best: { assetId: string; url: string; reason: 'exact' | 'family' | 'similar' } | null;
}

export type Issue = 'no_image' | 'approx_image' | 'no_price' | 'no_stock' | 'ready';

/** What a product is missing. 'ready' = hidden but has image, price and stock. */
export function issuesOf(p: ProductHealth): Issue[] {
  const out: Issue[] = [];
  if (!p.imageUrl) out.push('no_image');
  else if (p.imageApprox) out.push('approx_image');
  if (p.pricedVariants === 0) out.push('no_price');
  if (p.stockUnits === 0) out.push('no_stock');
  if (!p.published && p.imageUrl && p.pricedVariants > 0 && p.stockUnits > 0) out.push('ready');
  return out;
}

interface Raw {
  product_id: string;
  make: string;
  model: string;
  model_number: string;
  category: string;
  published: boolean;
  created_at: string;
  image_url: string | null;
  image_approx: boolean;
  variants: number;
  stock_units: number;
  priced_variants: number;
  best_asset_id: string | null;
  best_asset_url: string | null;
  best_reason: 'exact' | 'family' | 'similar' | null;
}

export function useProductHealth() {
  return useQuery({
    queryKey: ['product-health'],
    staleTime: 30_000,
    queryFn: async (): Promise<ProductHealth[]> => {
      const { data, error } = await supabase.rpc('product_health');
      if (error) throw new Error(error.message);
      return ((data ?? []) as Raw[]).map((r) => ({
        id: r.product_id,
        make: r.make,
        model: r.model,
        modelNumber: r.model_number,
        category: r.category,
        published: r.published,
        createdAt: r.created_at,
        imageUrl: r.image_url,
        imageApprox: r.image_approx,
        variants: Number(r.variants),
        stockUnits: Number(r.stock_units),
        pricedVariants: Number(r.priced_variants),
        best: r.best_asset_id && r.best_asset_url && r.best_reason ? { assetId: r.best_asset_id, url: r.best_asset_url, reason: r.best_reason } : null,
      }));
    },
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['product-health'] });
    void qc.invalidateQueries({ queryKey: ['admin-products'] });
    void qc.invalidateQueries({ queryKey: ['catalog-listing'] });
    void qc.invalidateQueries({ queryKey: ['image-suggestions'] });
  };
}

/** Use each product's best bank image (exact always; family/similar only with allowApprox, then labelled illustrative). */
export function useApplyBestImages() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ ids, allowApprox }: { ids: string[]; allowApprox: boolean }) => {
      const { data, error } = await supabase.rpc('apply_best_images', { p_product_ids: ids, p_allow_approx: allowApprox });
      if (error) throw new Error(error.message);
      return data as { exact: number; approx: number; skipped: number };
    },
    onSuccess: invalidate,
  });
}

export function useSetPublished() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ ids, published }: { ids: string[]; published: boolean }) => {
      const { data, error } = await supabase.rpc('set_products_published', { p_product_ids: ids, p_published: published });
      if (error) throw new Error(error.message);
      return data as number;
    },
    onSuccess: invalidate,
  });
}

export { useInvalidate as useInvalidateProductHealth };
