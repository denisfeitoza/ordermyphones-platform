import { useSearchParams } from 'react-router-dom';
import { Check } from 'lucide-react';
import { CATALOG, CATEGORIES, CONDITIONS, type PhoneCategory } from '@/data/catalog';
import { cn } from '@/lib/utils';

const BRANDS = ['Apple', 'Samsung'] as const;
const PRICE_BANDS: { id: string; label: string; test: (msrp: number) => boolean }[] = [
  { id: 'lt600', label: 'Under $600', test: (c) => c < 60000 },
  { id: '600-1000', label: '$600 – $1,000', test: (c) => c >= 60000 && c < 100000 },
  { id: 'gt1000', label: '$1,000 & up', test: (c) => c >= 100000 },
];

function FilterRow({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-sm transition-colors',
        active ? 'bg-secondary font-medium text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <span className="flex items-center gap-2">
        <span
          className={cn(
            'grid h-4 w-4 place-items-center rounded border transition-colors',
            active ? 'border-brand bg-brand text-white' : 'border-border',
          )}
        >
          {active && <Check className="h-3 w-3" strokeWidth={3} />}
        </span>
        {label}
      </span>
      {count !== undefined && <span className="font-mono text-xs text-muted-foreground/70">{count}</span>}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border py-4 first:border-t-0 first:pt-0">
      <h3 className="mb-2 px-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

export function CatalogFilters({ className, hideTitle = false }: { className?: string; hideTitle?: boolean }) {
  const [params, setParams] = useSearchParams();

  function toggle(key: string, value: string) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (next.get(key) === value) next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );
  }

  const is = (key: string, value: string) => params.get(key) === value;
  const hasFilters = ['brand', 'category', 'condition', 'price'].some((k) => params.has(k));
  const countCat = (c: PhoneCategory) => CATALOG.filter((i) => i.category === c).length;

  return (
    <div className={cn('text-sm', className)}>
      {!hideTitle && (
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-base font-semibold tracking-tight">Filters</h2>
          {hasFilters && (
            <button
              onClick={() =>
                setParams(
                  (prev) => {
                    const next = new URLSearchParams(prev);
                    ['brand', 'category', 'condition', 'price'].forEach((k) => next.delete(k));
                    return next;
                  },
                  { replace: true },
                )
              }
              className="text-xs font-medium text-brand hover:underline"
            >
              Clear all
            </button>
          )}
        </div>
      )}

      <Section title="Category">
        {CATEGORIES.map((c) => (
          <FilterRow key={c.id} label={c.label} count={countCat(c.id)} active={is('category', c.id)} onClick={() => toggle('category', c.id)} />
        ))}
      </Section>

      <Section title="Brand">
        {BRANDS.map((b) => (
          <FilterRow key={b} label={b} count={CATALOG.filter((i) => i.brand === b).length} active={is('brand', b)} onClick={() => toggle('brand', b)} />
        ))}
      </Section>

      <Section title="Condition">
        {CONDITIONS.map((c) => (
          <FilterRow key={c.id} label={c.label} count={CATALOG.filter((i) => i.condition === c.id).length} active={is('condition', c.id)} onClick={() => toggle('condition', c.id)} />
        ))}
      </Section>

      <Section title="Price">
        {PRICE_BANDS.map((p) => (
          <FilterRow key={p.id} label={p.label} count={CATALOG.filter((i) => p.test(i.msrpCents)).length} active={is('price', p.id)} onClick={() => toggle('price', p.id)} />
        ))}
      </Section>
    </div>
  );
}

export { PRICE_BANDS };
