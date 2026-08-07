/**
 * Deterministic canonical SKU — mirrors public.omp_make_sku(...) in
 * supabase/migrations/20260807230000_sku_include_color.sql BYTE-FOR-BYTE.
 * Any change here must be mirrored there, or the dry-run preview SKU will
 * diverge from the server-authoritative SKU written at commit_stock_import.
 *
 * Color is part of the SKU (inserted right after capacity): two variants
 * differing ONLY by color are two distinct natural-key rows, so their SKUs
 * must differ too or the second insert violates product_variants_sku_key.
 *
 * Algorithm (see PRODUCT-CATALOG-STANDARD.md §6):
 *   model_slug   = upper(strip non-alnum from model)
 *   cap          = upper(strip non-alnum from capacity)
 *   color_token  = upper(strip non-alnum from color)
 *   grade_token  = upper(strip non-alnum from grade, with '+' -> 'P' and
 *                  '-' -> 'M' substituted FIRST — this is load-bearing: it
 *                  is what keeps "DLS B+" and "DLS B" from colliding once
 *                  stripped of punctuation)
 *   lock_ch      = 'L' for locked, 'U' for unlocked
 *   sku          = join([model_slug, cap, color_token, grade_token, carrier, lock_ch], '-')
 */
import type { CarrierCode, LockStatus } from './types';

const stripNonAlnum = (s: string): string => s.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

export function makeSku(
  model: string,
  capacity: string | null | undefined,
  color: string | null | undefined,
  grade: string | null | undefined,
  carrier: CarrierCode,
  lock: LockStatus,
): string {
  const modelSlug = stripNonAlnum(model ?? '');
  const cap = stripNonAlnum(capacity ?? '');
  const colorToken = stripNonAlnum(color ?? '');
  const gradeToken = stripNonAlnum((grade ?? '').replace(/\+/g, 'P').replace(/-/g, 'M'));
  const lockCh = lock === 'locked' ? 'L' : 'U';
  return [modelSlug, cap, colorToken, gradeToken, carrier, lockCh].join('-');
}
