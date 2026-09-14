import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * Admin product content — the part of a product the import can't carry:
 * photo, description, publish switch (v1.0 plan S2). Products themselves
 * are created by the import; staff only enrich them here. RLS: products
 * staff write; storage bucket product-photos (public read, staff write).
 * 20260913160000_product_content.sql.
 */

export interface AdminProduct {
  id: string;
  make: string;
  model: string;
  modelNumber: string;
  category: string;
  description: string | null;
  imageUrl: string | null;
  published: boolean;
  variantCount: number;
  createdAt: string;
}

interface RawProduct {
  id: string;
  make: string;
  model: string;
  model_number: string;
  category: string;
  description: string | null;
  image_url: string | null;
  published: boolean;
  created_at: string;
  product_variants: { count: number }[] | null;
}

export const PRODUCT_PHOTOS_BUCKET = 'product-photos';

async function fetchAdminProducts(): Promise<AdminProduct[]> {
  const { data, error } = await supabase
    .from('products')
    .select('id, make, model, model_number, category, description, image_url, published, created_at, product_variants(count)')
    .order('make')
    .order('model');
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as RawProduct[]).map((p) => ({
    id: p.id,
    make: p.make,
    model: p.model,
    modelNumber: p.model_number,
    category: p.category,
    description: p.description,
    imageUrl: p.image_url,
    published: p.published,
    variantCount: p.product_variants?.[0]?.count ?? 0,
    createdAt: p.created_at,
  }));
}

export function useAdminProducts() {
  return useQuery({ queryKey: ['admin-products'], queryFn: fetchAdminProducts, staleTime: 60_000 });
}

export interface ProductPatch {
  description?: string | null;
  published?: boolean;
  image_url?: string | null;
}

export async function updateProduct(id: string, patch: ProductPatch): Promise<void> {
  const { error } = await supabase.from('products').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** Upload a photo to product-photos/<productId>/<ts>.<ext> and point the product at its public URL. */
export async function uploadProductPhoto(productId: string, file: File): Promise<string> {
  if (!PHOTO_TYPES.has(file.type)) throw new Error('Use a JPG, PNG or WebP image.');
  if (file.size > MAX_PHOTO_BYTES) throw new Error('Photo must be 5 MB or smaller.');
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${productId}/${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage.from(PRODUCT_PHOTOS_BUCKET).upload(path, file, { upsert: true, contentType: file.type, cacheControl: '31536000' });
  if (upErr) throw new Error(upErr.message);
  const { data } = supabase.storage.from(PRODUCT_PHOTOS_BUCKET).getPublicUrl(path);
  await updateProduct(productId, { image_url: data.publicUrl });
  return data.publicUrl;
}

/** Invalidates admin + storefront caches: the listing view carries image/description/published. */
function useInvalidateProducts() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['admin-products'] });
    void qc.invalidateQueries({ queryKey: ['catalog-listing'] });
  };
}

export function useUpdateProduct() {
  const invalidate = useInvalidateProducts();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ProductPatch }) => updateProduct(id, patch),
    onSuccess: invalidate,
  });
}

export function useUploadProductPhoto() {
  const invalidate = useInvalidateProducts();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => uploadProductPhoto(id, file),
    onSuccess: invalidate,
  });
}
