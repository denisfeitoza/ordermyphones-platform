import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/i18n';
import { carrierLabel } from '@/data/realCatalog';
import { BrandLogo, type BrandName } from './BrandLogos';
import {
  FACET_KEYS,
  REAL_PRICE_BANDS,
  UNPRICED_BAND,
  type FacetKey,
  type FacetState,
} from '@/lib/realCatalogFacets';

/**
 * Real-mode catalog facet panel (M2-P1). Multi-select checkboxes with
 * add-this-value counts, mirroring the mock <CatalogFilters> visual language
 * (FilterRow + Section) but driven by the live listing set rather than the
 * mock taxonomy. Pure presentational: all state + count math lives in the
 * parent via computeFacetedCatalog. The `price` axis is hidden when signed
 * out (every item is unpriced then, so the facet carries no signal).
 */

interface Props {
  counts: Record<FacetKey, Map<string, number>>;
  facets: FacetState;
  onToggle: (key: FacetKey, value: string) => void;
  onClearAll: () => void;
  signedIn: boolean;
  /** Suppress the panel's own "Filters" heading — used inside the mobile
   * drawer, which already renders its own header. */
  hideTitle?: boolean;
  className?: string;
}

// Semantic orderings so facet rows read naturally, not by hash order.
const GRADE_RANK: Record<string, number> = {
  New: 0,
  'Certified Pre-Owned': 1,
  'Certified Pre-Owned · Grade A': 2,
  'Grade B': 3,
  'Grade C': 4,
  'Grade D': 5,
};
const PRICE_ORDER = [...REAL_PRICE_BANDS.map((b) => b.id), UNPRICED_BAND];
const PRICE_LABEL: Record<string, string> = {
  ...Object.fromEntries(REAL_PRICE_BANDS.map((b) => [b.id, b.label])),
  [UNPRICED_BAND]: 'Not priced for your tier',
};
const LOCK_LABEL: Record<string, string> = { unlocked: 'Unlocked', locked: 'Locked' };

function capacityGb(v: string): number {
  const m = /([\d.]+)\s*(tb|gb)/i.exec(v);
  if (!m) return Number.MAX_SAFE_INTEGER;
  const n = parseFloat(m[1]);
  return m[2].toLowerCase() === 'tb' ? n * 1024 : n;
}

/** Ordered list of values to render for one axis: everything with a count,
 * unioned with any currently-selected value (so a selection whose count fell
 * to 0 can still be unticked), sorted per-axis. */
function orderedValues(key: FacetKey, counts: Map<string, number>, selected: Set<string>): string[] {
  const values = new Set<string>([...counts.keys(), ...selected]);
  const arr = [...values];
  switch (key) {
    case 'grade':
      return arr.sort((a, b) => (GRADE_RANK[a] ?? 99) - (GRADE_RANK[b] ?? 99));
    case 'capacity':
      return arr.sort((a, b) => capacityGb(a) - capacityGb(b));
    case 'price':
      return arr.sort((a, b) => PRICE_ORDER.indexOf(a) - PRICE_ORDER.indexOf(b));
    case 'lock':
      return arr.sort((a, b) => (a === 'unlocked' ? -1 : 1) - (b === 'unlocked' ? -1 : 1));
    case 'carrier':
      return arr.sort((a, b) => carrierLabel(a).localeCompare(carrierLabel(b)));
    default:
      // make, location — most-common first, then alpha
      return arr.sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b));
  }
}

/** Human label for one facet value — carrier code → "Verizon", lock →
 * "Unlocked", price band id → its range. Exported so the active-filter chips
 * in RealCatalogView render identical labels. */
export function facetValueLabel(key: FacetKey, value: string): string {
  switch (key) {
    case 'carrier':
      return carrierLabel(value);
    case 'lock':
      return LOCK_LABEL[value] ?? value;
    case 'price':
      return PRICE_LABEL[value] ?? value;
    default:
      return value;
  }
}

// Known brand marks for the Brand facet. Only makes we render a logo for.
const BRAND_MAKES = new Set<BrandName>(['Apple', 'Samsung', 'Google', 'Nokia', 'Motorola', 'LG', 'TCL', 'Infinix']);
const brandOf = (make: string): BrandName | null => (BRAND_MAKES.has(make as BrandName) ? (make as BrandName) : null);

function FilterRow({
  label,
  count,
  active,
  onClick,
  leading,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  leading?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-h-11 w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition-colors sm:min-h-0',
        active ? 'bg-secondary font-medium text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <span className="flex items-center gap-2">
        <span
          className={cn(
            'grid h-4 w-4 shrink-0 place-items-center rounded border transition-colors',
            active ? 'border-brand bg-brand text-white' : 'border-border',
          )}
        >
          {active && <Check className="h-3 w-3" strokeWidth={3} />}
        </span>
        {leading}
        {label}
      </span>
      <span className="font-mono text-xs text-muted-foreground/70">{count}</span>
    </button>
  );
}

export function RealCatalogFilters({ counts, facets, onToggle, onClearAll, signedIn, hideTitle = false, className }: Props) {
  const { t } = useI18n();

  const SECTIONS: { key: FacetKey; title: string }[] = [
    { key: 'make', title: t('Brand') },
    { key: 'grade', title: t('Condition') },
    { key: 'capacity', title: t('Storage') },
    { key: 'carrier', title: t('Carrier') },
    { key: 'lock', title: t('Lock status') },
    { key: 'location', title: t('Location') },
    { key: 'price', title: t('Price') },
  ];

  const active = FACET_KEYS.some((k) => facets[k].size > 0);

  return (
    <div className={cn('text-sm', className)}>
      {!hideTitle && (
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-base font-semibold tracking-tight">{t('Filters')}</h2>
          {active && (
            <button onClick={onClearAll} className="text-xs font-medium text-brand hover:underline">
              {t('Clear all')}
            </button>
          )}
        </div>
      )}

      {SECTIONS.map(({ key, title }) => {
        if (key === 'price' && !signedIn) return null;
        const values = orderedValues(key, counts[key], facets[key]);
        // Hide a single-value axis (nothing to choose) unless something is selected.
        if (values.length < 2 && facets[key].size === 0) return null;
        return (
          <div key={key} className="border-t border-border py-4 first:border-t-0 first:pt-0">
            <h3 className="mb-2 px-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
            <div className="space-y-0.5">
              {values.map((v) => {
                const brand = key === 'make' ? brandOf(v) : null;
                return (
                  <FilterRow
                    key={v}
                    label={facetValueLabel(key, v)}
                    count={counts[key].get(v) ?? 0}
                    active={facets[key].has(v)}
                    onClick={() => onToggle(key, v)}
                    leading={
                      brand ? (
                        <span className="grid w-6 shrink-0 place-items-center text-foreground [&>span]:!text-sm [&>svg]:!h-4 [&>svg]:!w-4">
                          <BrandLogo brand={brand} />
                        </span>
                      ) : undefined
                    }
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
