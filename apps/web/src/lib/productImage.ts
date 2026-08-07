import { CATALOG } from '@/data/catalog';

/**
 * Real catalog listings (imported supplier stock) have no photo pipeline —
 * PRODUCT-CATALOG-STANDARD.md's feed carries no image column at all. Best
 * effort: reuse a mock asset when the real model name overlaps a known
 * model family (forward-compatible once a real photo pipeline lands, and
 * free — the mock's iPhone/Galaxy renders already exist). Returns null when
 * nothing matches; callers render a placeholder tile instead of an <img>,
 * so no card is ever imageless.
 */
export function resolveProductImage(model: string): string | null {
  const needle = model.trim().toLowerCase();
  if (!needle) return null;
  const hit = CATALOG.find((c) => {
    const family = c.model.toLowerCase();
    return needle === family || needle.includes(family) || family.includes(needle);
  });
  return hit?.image ?? null;
}
