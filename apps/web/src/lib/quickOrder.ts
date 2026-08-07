import type { PricedRealListing } from '@/data/realCatalog';

/**
 * Quick-order paste parser + resolver (M2-P4). A B2B buyer pastes a two-column
 * list (SKU + qty) from their own sheet; we turn it into cart lines, surfacing
 * every problem line explicitly instead of silently dropping it. Pure, so the
 * parsing/resolution is unit-tested directly. This is deliberately NOT the
 * import mapping engine — the shape is SKU+qty, not variant attributes.
 */

export interface ParsedQuickLine {
  raw: string;
  sku: string;
  qty: number;
}

export type QuickProblemReason = 'bad_line' | 'not_found' | 'unpriced';

export interface QuickOrderProblem {
  raw: string;
  sku?: string;
  reason: QuickProblemReason;
}

export interface ResolvedQuickLine {
  item: PricedRealListing;
  qty: number;
}

/**
 * Parse pasted text into {sku, qty} lines. Tolerant of the separators a
 * spreadsheet copy produces — comma, tab, semicolon, pipe, or spaces:
 *   "SKU,5"  "SKU\t5"  "SKU 5"  "SKU"  (bare SKU → qty 1)
 * A line whose last token isn't a positive integer (and isn't a lone SKU) is
 * returned as a `bad_line` problem, never guessed. SKUs are uppercased (the
 * canonical SKU form) for matching.
 */
export function parseQuickOrder(text: string): { lines: ParsedQuickLine[]; problems: QuickOrderProblem[] } {
  const lines: ParsedQuickLine[] = [];
  const problems: QuickOrderProblem[] = [];

  for (const raw of text.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/[\s,;|]+/).filter(Boolean);

    if (parts.length === 1) {
      lines.push({ raw: trimmed, sku: parts[0].toUpperCase(), qty: 1 });
      continue;
    }
    const last = parts[parts.length - 1];
    if (/^\d+$/.test(last)) {
      const qty = parseInt(last, 10);
      if (qty > 0) {
        lines.push({ raw: trimmed, sku: parts[0].toUpperCase(), qty });
        continue;
      }
    }
    problems.push({ raw: trimmed, reason: 'bad_line' });
  }

  return { lines, problems };
}

/**
 * Resolve parsed lines against the live catalog. Aggregates duplicate SKUs
 * (summing qty). A SKU not in the catalog → `not_found`; a SKU in the catalog
 * but with no price for the caller's tier (grade-gated, or signed out) →
 * `unpriced`. Only priced, in-catalog SKUs become resolved cart lines.
 */
export function resolveQuickOrder(
  parsed: ParsedQuickLine[],
  items: PricedRealListing[],
): { resolved: ResolvedQuickLine[]; problems: QuickOrderProblem[] } {
  const bySku = new Map(items.map((i) => [i.sku.toUpperCase(), i]));
  const agg = new Map<string, number>(); // sku -> qty
  const order: string[] = []; // preserve first-seen order
  for (const l of parsed) {
    if (!agg.has(l.sku)) order.push(l.sku);
    agg.set(l.sku, (agg.get(l.sku) ?? 0) + l.qty);
  }

  const resolved: ResolvedQuickLine[] = [];
  const problems: QuickOrderProblem[] = [];
  for (const sku of order) {
    const qty = agg.get(sku)!;
    const item = bySku.get(sku);
    if (!item) {
      problems.push({ raw: sku, sku, reason: 'not_found' });
    } else if (item.priceCents === null) {
      problems.push({ raw: sku, sku, reason: 'unpriced' });
    } else {
      resolved.push({ item, qty });
    }
  }

  return { resolved, problems };
}
