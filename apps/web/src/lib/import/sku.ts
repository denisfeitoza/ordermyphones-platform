/**
 * Deterministic canonical SKU — mirrors public.omp_make_sku(...) in
 * supabase/migrations/20260807140000_import_helpers_commit_rpc.sql
 * BYTE-FOR-BYTE. Any change here must be mirrored there, or the dry-run
 * preview SKU will diverge from the server-authoritative SKU written at
 * commit_stock_import.
 *
 * Algorithm (see PRODUCT-CATALOG-STANDARD.md §6):
 *   model_slug   = upper(strip non-alnum from model)
 *   cap          = upper(strip non-alnum from capacity)
 *   grade_token  = upper(strip non-alnum from grade, with '+' -> 'P' and
 *                  '-' -> 'M' substituted FIRST — this is load-bearing: it
 *                  is what keeps "DLS B+" and "DLS B" from colliding once
 *                  stripped of punctuation)
 *   lock_ch      = 'L' for locked, 'U' for unlocked
 *   sku          = join([model_slug, cap, grade_token, carrier, lock_ch], '-')
 */
import type { CarrierCode, LockStatus } from './types';

const stripNonAlnum = (s: string): string => s.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

export function makeSku(
  model: string,
  capacity: string | null | undefined,
  grade: string | null | undefined,
  carrier: CarrierCode,
  lock: LockStatus,
): string {
  const modelSlug = stripNonAlnum(model ?? '');
  const cap = stripNonAlnum(capacity ?? '');
  const gradeToken = stripNonAlnum((grade ?? '').replace(/\+/g, 'P').replace(/-/g, 'M'));
  const lockCh = lock === 'locked' ? 'L' : 'U';
  return [modelSlug, cap, gradeToken, carrier, lockCh].join('-');
}
