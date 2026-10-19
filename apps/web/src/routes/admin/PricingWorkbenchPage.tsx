import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, MapPin, Wand2, Check, AlertTriangle, RotateCcw } from 'lucide-react';
import { usePricingBreakdown, setTierPrice, useManualPrices, isBelowCost, revertTierPriceToAuto, TIER_MARKUP, type ManualPriceRow, type PricingBreakdownRow, type DbTier } from '@/data/adminPricing';
import { useAuth } from '@/store';
import { AdminHeading, Panel } from '@/components/admin/parts';
import { Button } from '@/components/ui/Button';
import { formatUsd } from '@/lib/format';
import { tierBg } from '@/lib/tierStyles';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { parseMoneyToCents } from '@/lib/money';
import { adminErrorMessage } from '@/lib/adminErrors';

const TIERS: { code: DbTier; label: string; tone: '1' | '2' | '3' | '4' }[] = [
  { code: 'consumer', label: 'Consumer', tone: '1' },
  { code: 'retailer', label: 'Retailer', tone: '2' },
  { code: 'wholesale', label: 'Wholesale', tone: '3' },
  { code: 'distributor', label: 'Distributor', tone: '4' },
];

const centsToStr = (c: number | null) => (c === null ? '' : (c / 100).toFixed(2));
const strToCents = (s: string) => parseMoneyToCents(s);
/** Non-empty but unreadable ("1,299.00"): block the save instead of clearing the price. */
const isInvalidPrice = (s: string) => s.trim() !== '' && parseMoneyToCents(s) === null;

function name(r: PricingBreakdownRow) {
  const lock = r.lock_status === 'unlocked' ? 'Unlocked' : 'Locked';
  return `${r.make} ${r.model} · ${r.capacity}${r.color ? ' · ' + r.color : ''} · ${lock}`;
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
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { role } = useAuth();
  const canEdit = role === 'admin'; // set_tier_price is admin-only (audit P1-11)
  const [saved, setSaved] = useState(false);

  // Auto-price every tier from a chosen cost basis (avg or highest) × the tier
  // markup. Two explicit buttons below drive this — no basis toggle to flip.
  function fillFrom(basisCost: number | null) {
    if (!basisCost) return;
    setEdits({
      consumer: (Math.round(basisCost * TIER_MARKUP.consumer) / 100).toFixed(2),
      retailer: (Math.round(basisCost * TIER_MARKUP.retailer) / 100).toFixed(2),
      wholesale: (Math.round(basisCost * TIER_MARKUP.wholesale) / 100).toFixed(2),
      distributor: (Math.round(basisCost * TIER_MARKUP.distributor) / 100).toFixed(2),
    });
  }

  const invalid = TIERS.some((tier) => isInvalidPrice(edits[tier.code]));
  const dirty = TIERS.some((tier) => strToCents(edits[tier.code]) !== current[tier.code]);

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      for (const tier of TIERS) {
        const next = strToCents(edits[tier.code]);
        if (next !== current[tier.code]) await setTierPrice(row.variant_id, tier.code, next);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    } catch (e) {
      // A mid-loop failure leaves earlier tiers saved — say so instead of
      // failing silently (audit 2026-09-13 P2); the breakdown refetch below
      // shows exactly which tiers landed.
      setSaveError(e instanceof Error ? e.message : t('Could not save prices'));
    } finally {
      await qc.invalidateQueries({ queryKey: ['pricing-breakdown'] });
      void qc.invalidateQueries({ queryKey: ['manual-prices'] });
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="min-w-0">
        <p className="font-medium">{name(row)}</p>
        <p className="font-mono text-xs text-muted-foreground">{row.sku} · {row.ctia_grade} · {row.total_qty} in stock</p>
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
                aria-invalid={isInvalidPrice(edits[tier.code]) || undefined}
                className={cn(
                  'h-9 w-full rounded-lg border bg-transparent pl-6 pr-2 text-right font-mono text-sm tabular-nums outline-none focus:border-brand',
                  isInvalidPrice(edits[tier.code]) ? 'border-destructive' : 'border-border',
                )}
              />
            </div>
            {row.max_cost !== null && (strToCents(edits[tier.code]) ?? Infinity) < row.max_cost && (
              <span className="text-[0.7rem] font-medium text-destructive">{t('Below highest cost')}</span>
            )}
          </label>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {/* One location (or one cost) makes average and highest the same number:
            show a single button instead of two that do the same thing. */}
        {row.avg_cost !== null && row.avg_cost === row.max_cost ? (
          <Button size="sm" variant="outline" className="min-h-11 sm:min-h-0" onClick={() => fillFrom(row.avg_cost)} title={formatUsd(row.avg_cost)}>
            <Wand2 className="h-3.5 w-3.5" strokeWidth={2} />
            {t('Fill from cost')}
            <span className="font-mono text-xs text-muted-foreground">· {formatUsd(row.avg_cost)}</span>
          </Button>
        ) : (
          <>
            <Button size="sm" variant="outline" className="min-h-11 sm:min-h-0" onClick={() => fillFrom(row.avg_cost)} disabled={!row.avg_cost} title={row.avg_cost ? formatUsd(row.avg_cost) : undefined}>
              <Wand2 className="h-3.5 w-3.5" strokeWidth={2} />
              {t('Fill from average cost')}
              {row.avg_cost ? <span className="font-mono text-xs text-muted-foreground">· {formatUsd(row.avg_cost)}</span> : null}
            </Button>
            <Button size="sm" variant="outline" className="min-h-11 sm:min-h-0" onClick={() => fillFrom(row.max_cost)} disabled={!row.max_cost} title={row.max_cost ? formatUsd(row.max_cost) : undefined}>
              <Wand2 className="h-3.5 w-3.5" strokeWidth={2} />
              {t('Fill from highest cost')}
              {row.max_cost ? <span className="font-mono text-xs text-muted-foreground">· {formatUsd(row.max_cost)}</span> : null}
            </Button>
          </>
        )}
        {invalid && <span className="text-xs text-destructive">{t('Type prices without thousands separators, e.g. 1299.00')}</span>}
        {saveError && <span className="text-xs text-destructive">{saveError}</span>}
        <Button size="sm" variant="primary" className="ml-auto" onClick={save} disabled={!dirty || invalid || saving || !canEdit} title={!canEdit ? t('Setting sell prices is admin-only.') : undefined}>
          {saved ? <Check className="h-4 w-4" strokeWidth={2.5} /> : null}
          {saving ? t('Saving…') : saved ? t('Saved') : t('Save prices')}
        </Button>
      </div>
    </div>
  );
}

/** Every hand-set price, below-cost ones first, each with "Revert to auto". */
function ManualPricesPanel() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { role } = useAuth();
  const q = useManualPrices();
  const [open, setOpen] = useState(false);
  const revert = useMutation({
    mutationFn: (r: ManualPriceRow) => revertTierPriceToAuto(r.variantId, r.tier),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['manual-prices'] });
      void qc.invalidateQueries({ queryKey: ['pricing-breakdown'] });
      void qc.invalidateQueries({ queryKey: ['catalog-listing'] });
    },
  });
  const rows = q.data ?? [];
  if (rows.length === 0) return null;
  const below = rows.filter(isBelowCost).length;
  const shown = open ? rows : rows.slice(0, 5);

  return (
    <Panel
      title={`${t('Prices set by hand')} · ${rows.length}`}
      action={below > 0 ? (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive">
          <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2} />
          {below} {t('below cost')}
        </span>
      ) : undefined}
    >
      <ul className="divide-y divide-border">
        {shown.map((r) => {
          const low = isBelowCost(r);
          return (
            <li key={`${r.variantId}-${r.tier}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-sm">
              <div className="min-w-0 flex-1 basis-56">
                <p className="truncate font-medium">{r.name}</p>
                <p className="font-mono text-xs text-muted-foreground">{r.sku} · {t(TIERS.find((x) => x.code === r.tier)?.label ?? r.tier)}</p>
              </div>
              <div className="text-right font-mono text-sm tabular-nums">
                <span className={cn(low && 'text-destructive')}>{r.visible ? formatUsd(r.priceCents) : t('Hidden')}</span>
                <span className="block text-xs text-muted-foreground">{t('cost')} {r.basisCostCents === null ? '—' : formatUsd(r.basisCostCents)}</span>
              </div>
              {r.tier !== 'consumer' && role === 'admin' && (
                <Button size="sm" variant="outline" disabled={revert.isPending} onClick={() => revert.mutate(r)}>
                  <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
                  {t('Revert to auto')}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {revert.isError && <p className="px-5 pb-3 text-xs text-destructive">{adminErrorMessage(t, revert.error.message)}</p>}
      {rows.length > 5 && (
        <button type="button" onClick={() => setOpen((v) => !v)} className="w-full border-t border-border px-5 py-3 text-sm font-medium text-brand hover:bg-muted/40">
          {open ? t('Show less') : `${t('Show all')} (${rows.length})`}
        </button>
      )}
    </Panel>
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
        <b className="text-foreground">{t('How this works:')}</b> {t('search a model, see its cost in each warehouse, and set each tier’s price. Use')} <b className="text-foreground">{t('the fill buttons')}</b> {t('to auto-price from the average or highest cost plus a margin — then tweak any number. Saved prices go live immediately for that tier.')}
      </div>

      <ManualPricesPanel />

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
