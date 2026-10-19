import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { normalizeModel } from '@/lib/productImage';

/**
 * Image bank (public.image_assets): every product image is a reusable asset
 * tagged with the model keys it represents. Studio renders were the first
 * assets; every staff upload joins the bank, so the next product of that
 * model (manual or imported) gets it automatically. Staff-only (RLS).
 * 20261018220000_image_bank.sql / 20261018221000_product_create_and_image_suggest.sql
 */

export type SuggestionReason = 'exact' | 'family' | 'similar' | 'brand';

export interface ImageSuggestion {
  assetId: string;
  url: string;
  kind: 'render' | 'upload';
  modelKeys: string[];
  colorKey: string | null;
  reason: SuggestionReason;
  score: number;
}

interface RawSuggestion {
  asset_id: string;
  url: string;
  kind: 'render' | 'upload';
  model_keys: string[];
  color_key: string | null;
  reason: SuggestionReason;
  score: number;
}

/** Ranked candidates for a model name (exact first, then family, similar, brand). */
export function useImageSuggestions(model: string, make: string, color?: string | null) {
  const m = model.trim();
  return useQuery({
    queryKey: ['image-suggestions', m.toLowerCase(), make.trim().toLowerCase(), color ?? null],
    enabled: m.length >= 2 || make.trim().length >= 2,
    staleTime: 60_000,
    queryFn: async (): Promise<ImageSuggestion[]> => {
      const { data, error } = await supabase.rpc('suggest_product_images', {
        p_model: m,
        p_make: make.trim() || null,
        p_color: color ?? null,
      });
      if (error) throw new Error(error.message);
      return ((data ?? []) as RawSuggestion[]).map((r) => ({
        assetId: r.asset_id,
        url: r.url,
        kind: r.kind,
        modelKeys: r.model_keys ?? [],
        colorKey: r.color_key,
        reason: r.reason,
        score: Number(r.score),
      }));
    },
  });
}

export interface LibraryAsset {
  id: string;
  url: string;
}

const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const SOURCE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_EDGE = 1600;
const BUCKET = 'product-photos';

/** Re-encode to WebP (longest edge ≤ 1600 px). Drops EXIF/GPS metadata, keeps
 * every library image light, and gives identical photos the same hash. */
async function toWebp(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot process images.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.86));
  if (!blob) throw new Error('This browser cannot encode WebP images.');
  return { blob, width, height };
}

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Add a photo to the bank, tagged with the model it shows (and its colour,
 * when it is a colour photo). The same picture uploaded twice returns the
 * existing asset instead of a copy.
 */
export async function uploadToLibrary(file: File, tag: { make: string; model: string; colorKey?: string | null }): Promise<LibraryAsset> {
  if (!SOURCE_TYPES.has(file.type)) throw new Error('Use a JPG, PNG or WebP image.');
  if (file.size > MAX_SOURCE_BYTES) throw new Error('Image must be 15 MB or smaller.');
  const { blob, width, height } = await toWebp(file);
  const sha = await sha256Hex(blob);

  const existing = await supabase.from('image_assets').select('id, url').eq('sha256', sha).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return existing.data as LibraryAsset;

  const path = `library/${sha}.webp`;
  const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/webp', cacheControl: '31536000', upsert: true });
  if (up.error) throw new Error(up.error.message);
  const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  const key = normalizeModel(tag.model);
  const { data: user } = await supabase.auth.getUser();
  const ins = await supabase
    .from('image_assets')
    .insert({
      url,
      storage_path: path,
      kind: 'upload',
      make: tag.make.trim() || null,
      model_keys: key ? [key] : [],
      color_key: tag.colorKey ?? null,
      sha256: sha,
      width,
      height,
      created_by: user.user?.id ?? null,
    })
    .select('id, url')
    .single();
  if (ins.error) throw new Error(ins.error.message);
  return ins.data as LibraryAsset;
}

/** 'exact' = this image IS the model (the bank learns the spelling);
 * 'approx' = another model of the family, labelled illustrative in the store. */
export async function attachProductImage(productId: string, assetId: string | null, mode: 'exact' | 'approx' = 'exact'): Promise<void> {
  const { error } = await supabase.rpc('attach_product_image', { p_product_id: productId, p_asset_id: assetId, p_mode: mode });
  if (error) throw new Error(error.message);
}

export interface NewVariantInput {
  capacity: string;
  color: string;
  grade: string;
  carrier: string;
  lock_status: 'locked' | 'unlocked';
  stock: { location_id: string; qty: number; unit_cost_cents: number }[];
}

export interface NewProductInput {
  make: string;
  model: string;
  model_number: string;
  category: 'phones' | 'accessories' | 'wearables';
  description: string;
  published: boolean;
  image_asset_id: string | null;
  image_mode: 'exact' | 'approx';
  variants: NewVariantInput[];
}

export async function createProduct(input: NewProductInput): Promise<string> {
  const { data, error } = await supabase.rpc('create_product', { p: input });
  if (error) throw Object.assign(new Error(error.message), { details: error.details ?? null });
  return data as string;
}

/** Grades the catalog can map to a CTIA grade (a manual variant must use one). */
export function useKnownGrades() {
  return useQuery({
    queryKey: ['known-grades'],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<{ grade: string; ctia: string }[]> => {
      const { data, error } = await supabase.from('vendor_grade_map').select('vendor_grade, ctia').order('vendor_grade');
      if (error) throw new Error(error.message);
      const seen = new Map<string, string>();
      for (const r of (data ?? []) as { vendor_grade: string; ctia: string }[]) if (!seen.has(r.vendor_grade)) seen.set(r.vendor_grade, r.ctia);
      return [...seen].map(([grade, ctia]) => ({ grade, ctia }));
    },
  });
}

export function useActiveLocations() {
  return useQuery({
    queryKey: ['active-locations'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ id: string; name: string }[]> => {
      const { data, error } = await supabase.from('stock_locations').select('id, display_name').eq('active', true).order('display_name');
      if (error) throw new Error(error.message);
      return ((data ?? []) as { id: string; display_name: string }[]).map((l) => ({ id: l.id, name: l.display_name }));
    },
  });
}
