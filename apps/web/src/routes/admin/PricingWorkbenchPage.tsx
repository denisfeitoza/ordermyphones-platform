import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Search, MapPin, Wand2, Check } from 'lucide-react';
import { usePricingBreakdown, setTierPrice, TIER_MARKUP, type PricingBreakdownRow, type DbTier } from '@/data/adminPricing';
import { AdminHeading, Panel } from '@/components/admin/parts';
import { Button } from '@/components/ui/Button';
import { formatUsd } from '@/lib/format';
import { tierBg } from '@/lib/tierStyles';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

const TIERS: { code: DbTier; label: string; tone: '1' | '2' | '3' | '4' }[] = [
  { code: 'consumer', label: 'Consumer', tone: '1' },
  { code: 'retailer', label: 'Retailer', tone: '2' },
  { code: 'wholesale', label: 'Wholesale', tone: '3' },
  { code: 'distributor', label: 'Distributor', tone: '4' },
];

const centsToStr = (c: number | null) => (c === null ? '' : (c / 100).toFixed(2));
const strToCents = (s: string) => {
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
};

function name(r: PricingBreakdownRow) {
  const lock = r.lock_status === 'unlocked' ? 'Unlocked' : 'Locked';
  return `${r.model} · ${r.capacity}${r.color ? ' · ' + r.color : ''} · ${lock}`;
}

function WorkbenchRow({ row }: { row: PricingBreakdownRow }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const current = useMemo<Record<DbTier, number | null>>(
    () => ({ consumer: row.price_consumer, retailer: row.price_retailer, wholesale: row.price_wholesale, distributor: row.price_distributor }),
    [row],
  );
  const [edits, setEdits] = useState<Record<DbTier, string>>({
    consumer: centsToStr(row.price_consumer),
    retailer: centsToStr(row.price_retailer),
    wholesale: centsToStr(row.price_wholesale),
    distributor: centsToStr(row.price_distributor),
  });
  const [basis, setBasis] = useState<'avg' | 'max'>('max');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const basisCost = basis === 'avg' ? row.avg_cost : row.max_cost;

  function fillFromCost() {
    if (!basisCost) return;
    setEdits({
      consumer: (Math.round(basisCost * TIER_MARKUP.consumer) / 100).toFixed(2),
      retailer: (Math.round(basisCost * TIER_MARKUP.retailer) / 100).toFixed(2),
      wholesale: (Math.round(basisCost * TIER_MARKUP.wholesale) / 100).toFixed(2),
      distributor: (Math.round(basisCost * TIER_MARKUP.distributor) / 100).toFixed(2),
    });
  }

  const dirty = TIERS.some((tier) => strToCents(edits[tier.code]) !== current[tier.code]);

  async function save() {
    setSaving(true);
    try {
      for (const tier of TIERS) {
        const next = strToCents(edits[tier.code]);
        if (next !== current[tier.code]) await setTierPrice(row.variant_id, tier.code, next);
      }
      await qc.invalidateQueries({ queryKey: ['pricing-breakdown'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{name(row)}</p>
          <p className="font-mono text-xs text-muted-foreground">{row.sku} · {row.ctia_grade} · {row.total_qty} in stock</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">{t('Cost basis')}</span>
          <div className="inline-flex rounded-full border border-border p-0.5">
            {(['avg', 'max'] as const).map((b) => (
              <button
                key={b}
                onClick={() => setBasis(b)}
                className={cn('rounded-full px-2.5 py-1 font-medium transition-colors', basis === b ? 'bg-secondary text-foreground' : 'text-muted-foreground')}
              >
                {b === 'avg' ? t('Average') : t('Highest')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Cost per inventory location */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <MapPin className="h-3.5 w-3.5" strokeWidth={2} />
        {row.locations.map((l, i) => (
          <span key={i}>
            {l.name} <span className="font-mono text-foreground">{l.cost_cents === null ? '—' : formatUsd(l.cost_cents)}</span>
            <span className="text-muted-foreground/60"> · {l.qty}u</span>
          </span>
        ))}
        <span className="text-muted-foreground/50">|</span>
        <span>{t('Range')} <span className="font-mono text-foreground">{formatUsd(row.min_cost ?? 0)}–{formatUsd(row.max_cost ?? 0)}</span> · {t('avg')} <span className="font-mono text-foreground">{formatUsd(row.avg_cost ?? 0)}</span></span>
      </div>

      {/* Tier price inputs */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {TIERS.map((tier) => (
          <label key={tier.code} className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5 text-xs font-medium">
              <span className={cn('h-2 w-2 rounded-full', tierBg[tier.tone])} />
              {t(tier.label)}
            </span>
            <div className="relative">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
              <input
                inputMode="decimal"
                value={edits[tier.code]}
                onChange={(e) => setEdits((p) => ({ ...p, [tier.code]: e.target.value }))}
                placeholder="—"
                className="h-9 w-full rounded-lg border border-border bg-transparent pl-6 pr-2 text-right font-mono text-sm tabular-nums outline-none focus:border-brand"
              />
            </div>
          </label>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <Button size="sm" variant="outline" onClick={fillFromCost} disabled={!basisCost}>
          <Wand2 className="h-3.5 w-3.5" strokeWidth={2} />
          {basis === 'avg' ? t('Fill from average cost') : t('Fill from highest cost')}
        </Button>
        <Button size="sm" variant="primary" onClick={save} disabled={!dirty || saving}>
          {saved ? <Check className="h-4 w-4" strokeWidth={2.5} /> : null}
          {saving ? t('Saving…') : saved ? t('Saved') : t('Save prices')}
        </Button>
      </div>
    </div>
  );
}

export default function PricingWorkbenchPage() {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const q = usePricingBreakdown(query);
  const rows = q.data ?? [];

  return (
    <div className="space-y-6">
      <AdminHeading title="Prices" subtitle="See what you pay in each inventory, then set the sell price per tier." />

      <div className="rounded-2xl border border-brand/20 bg-brand/5 px-4 py-3 text-sm text-muted-foreground">
        <b className="text-foreground">{t('How this works:')}</b> {t('search a model, see its cost in each warehouse, and set each tier’s price. Use')} <b className="text-foreground">{t('Fill from cost')}</b> {t('to auto-price from the average or highest cost plus a margin — then tweak any number. Saved prices go live immediately for that tier.')}
      </div>

      <label className="relative block max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={2} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('Search a model — iPhone 13, Galaxy, SKU…')}
          className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm outline-none transition-colors focus:border-brand"
        />
      </label>

      {q.isLoading ? (
        <Panel><p className="py-10 text-center text-sm text-muted-foreground">{t('Loading…')}</p></Panel>
      ) : q.isError ? (
        <Panel><p className="py-10 text-center text-sm text-destructive">{t('Could not load prices.')}</p></Panel>
      ) : rows.length === 0 ? (
        <Panel><p className="py-10 text-center text-sm text-muted-foreground">{t('No matches. Try a model name or SKU.')}</p></Panel>
      ) : (
        <div className="space-y-3">
          {rows.length >= 300 && <p className="text-xs text-muted-foreground">{t('Showing the first 300 — refine the search to narrow.')}</p>}
          {rows.map((r) => (
            <WorkbenchRow key={r.variant_id} row={r} />
          ))}
        </div>
      )}
    </div>
  );
}
