import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { attachProductImage, uploadToLibrary } from '@/data/imageBank';

/**
 * Admin product content — the part of a product the import can't carry:
 * photo, description, publish switch (v1.0 plan S2). Products come from the
 * import or from create_product (imageBank.ts). Photos go through the image
 * bank, so every upload is reusable. RLS: products staff write; storage
 * bucket product-photos (public read, staff write).
 */

export interface AdminProduct {
  id: string;
  make: string;
  model: string;
  modelNumber: string;
  category: string;
  description: string | null;
  imageUrl: string | null;
  /** The image shows another model of the family (labelled illustrative in the store). */
  imageApprox: boolean;
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
  image_approx: boolean;
  published: boolean;
  created_at: string;
  product_variants: { count: number }[] | null;
}

async function fetchAdminProducts(): Promise<AdminProduct[]> {
  const { data, error } = await supabase
    .from('products')
    .select('id, make, model, model_number, category, description, image_url, image_approx, published, created_at, product_variants(count)')
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
    imageApprox: p.image_approx,
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
}

export async function updateProduct(id: string, patch: ProductPatch): Promise<void> {
  const { error } = await supabase.from('products').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Upload a photo of this exact model: it joins the image bank and becomes the product's image. */
export async function uploadProductPhoto(product: Pick<AdminProduct, 'id' | 'make' | 'model'>, file: File): Promise<string> {
  const asset = await uploadToLibrary(file, { make: product.make, model: product.model });
  await attachProductImage(product.id, asset.id, 'exact');
  return asset.url;
}

/** Invalidates admin + storefront caches: the listing view carries image/description/published. */
function useInvalidateProducts() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['admin-products'] });
    void qc.invalidateQueries({ queryKey: ['product-health'] });
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
    mutationFn: ({ product, file }: { product: Pick<AdminProduct, 'id' | 'make' | 'model'>; file: File }) => uploadProductPhoto(product, file),
    onSuccess: invalidate,
  });
}

/** Use a bank image for a product ('exact' teaches the bank; 'approx' is labelled illustrative). */
export function useAttachProductImage() {
  const invalidate = useInvalidateProducts();
  return useMutation({
    mutationFn: ({ productId, assetId, mode }: { productId: string; assetId: string | null; mode: 'exact' | 'approx' }) => attachProductImage(productId, assetId, mode),
    onSuccess: invalidate,
  });
}

/** One colour a product carries, keyed like catalog_listing (public.color_key). */
export interface ProductColor {
  colorKey: string;
  label: string;
  variantCount: number;
  imageUrl: string | null;
}

interface RawProductColor {
  color_key: string;
  color_label: string;
  variant_count: number;
  image_url: string | null;
}

async function fetchProductColors(productId: string): Promise<ProductColor[]> {
  const { data, error } = await supabase
    .from('product_colors_admin')
    .select('color_key, color_label, variant_count, image_url')
    .eq('product_id', productId)
    .order('color_key');
  if (error) throw new Error(error.message);
  return ((data ?? []) as RawProductColor[]).map((c) => ({
    colorKey: c.color_key,
    label: c.color_label,
    variantCount: c.variant_count,
    imageUrl: c.image_url,
  }));
}

export function useProductColors(productId: string) {
  return useQuery({ queryKey: ['admin-product-colors', productId], queryFn: () => fetchProductColors(productId), staleTime: 60_000 });
}

/** Upload a photo for one colour of a product (product_color_images). It joins the image bank
 * tagged with model and colour, and wins over the model photo for that colour. */
export async function uploadColorPhoto(product: { id: string; make: string; model: string }, colorKey: string, file: File): Promise<string> {
  const asset = await uploadToLibrary(file, { make: product.make, model: product.model, colorKey });
  const { error } = await supabase
    .from('product_color_images')
    .upsert({ product_id: product.id, color_key: colorKey, image_url: asset.url, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  return asset.url;
}

export async function removeColorPhoto(productId: string, colorKey: string): Promise<void> {
  const { error } = await supabase.from('product_color_images').delete().eq('product_id', productId).eq('color_key', colorKey);
  if (error) throw new Error(error.message);
}

function useInvalidateColors(productId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['admin-product-colors', productId] });
    void qc.invalidateQueries({ queryKey: ['catalog-listing'] });
  };
}

export function useUploadColorPhoto(product: { id: string; make: string; model: string }) {
  const invalidate = useInvalidateColors(product.id);
  return useMutation({
    mutationFn: ({ colorKey, file }: { colorKey: string; file: File }) => uploadColorPhoto(product, colorKey, file),
    onSuccess: invalidate,
  });
}

export function useRemoveColorPhoto(productId: string) {
  const invalidate = useInvalidateColors(productId);
  return useMutation({
    mutationFn: (colorKey: string) => removeColorPhoto(productId, colorKey),
    onSuccess: invalidate,
  });
}
