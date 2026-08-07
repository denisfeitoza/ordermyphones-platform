import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, ClipboardList, ShoppingBag, Plus, Trash2, Search } from 'lucide-react';
import { useRealCart } from '@/store';
import { useRealCatalog, buildDisplayName, type PricedRealListing } from '@/data/realCatalog';
import { Button } from '@/components/ui/Button';
import { formatUsd } from '@/lib/format';
import { useI18n } from '@/i18n';

/**
 * Quick-order builder (M2-P4, search-driven). Instead of pasting a SKU list, the
 * buyer types ("iPhone"), sees matching variants, taps one, and sets a quantity
 * — building up a staged list they drop into the cart in one action. Only
 * priced, in-catalog variants are addable; everything is resolved live against
 * the real catalog. Real mode only (mounted from RealCatalogView).
 */

interface StagedLine {
  variantId: string;
  qty: number;
}

export function QuickOrderDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const { items } = useRealCatalog(true);
  const { add } = useRealCart();
  const [query, setQuery] = useState('');
  const [staged, setStaged] = useState<StagedLine[]>([]);

  const byVariant = useMemo(() => new Map(items.map((i) => [i.variantId, i])), [items]);
  const stagedIds = useMemo(() => new Set(staged.map((s) => s.variantId)), [staged]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [] as PricedRealListing[];
    const out: PricedRealListing[] = [];
    for (const i of items) {
      const hay = `${buildDisplayName(i)} ${i.make} ${i.sku} ${i.color ?? ''}`.toLowerCase();
      if (hay.includes(needle)) out.push(i);
      if (out.length >= 40) break;
    }
    return out;
  }, [items, query]);

  const stagedResolved = staged
    .map((s) => ({ ...s, item: byVariant.get(s.variantId) }))
    .filter((s): s is StagedLine & { item: PricedRealListing } => !!s.item);

  const totalUnits = stagedResolved.reduce((n, s) => n + s.qty, 0);
  const totalCents = stagedResolved.reduce((n, s) => n + (s.item.priceCents ?? 0) * s.qty, 0);

  function stage(variantId: string) {
    setStaged((prev) => (prev.some((s) => s.variantId === variantId) ? prev : [...prev, { variantId, qty: 1 }]));
  }
  function setQty(variantId: string, qty: number) {
    const n = Math.max(1, Math.floor(Number.isFinite(qty) ? qty : 1));
    setStaged((prev) => prev.map((s) => (s.variantId === variantId ? { ...s, qty: n } : s)));
  }
  function unstage(variantId: string) {
    setStaged((prev) => prev.filter((s) => s.variantId !== variantId));
  }
  function addAll() {
    for (const s of stagedResolved) add(s.item.variantId, s.qty);
    setStaged([]);
    setQuery('');
    onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <button className="absolute inset-0 cursor-default bg-foreground/40 backdrop-blur-sm" onClick={onClose} aria-label={t('Close')} />
          <motion.div
            className="relative flex max-h-[90dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-background shadow-2xl sm:rounded-2xl"
            initial={{ y: 24, opacity: 0.6, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            <header className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-brand" strokeWidth={2} />
                <h2 className="font-display text-lg font-semibold tracking-tight">{t('Quick order')}</h2>
              </div>
              <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full hover:bg-muted" aria-label={t('Close')}>
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="border-b border-border p-4">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={2} />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('Search a model — iPhone 15 Pro, Galaxy, SKU…')}
                  className="h-11 w-full rounded-xl border border-border bg-muted/30 pl-9 pr-3 text-sm outline-none transition-colors focus:border-brand"
                />
              </label>

              {query.trim() && (
                <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-border">
                  {results.length === 0 ? (
                    <p className="px-3 py-4 text-center text-sm text-muted-foreground">{t('No matches — try a different model or SKU.')}</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {results.map((i) => {
                        const already = stagedIds.has(i.variantId);
                        const priced = i.priceCents !== null;
                        return (
                          <li key={i.variantId}>
                            <button
                              type="button"
                              disabled={!priced || already}
                              onClick={() => stage(i.variantId)}
                              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50 disabled:cursor-default disabled:opacity-55"
                            >
                              <span className="min-w-0">
                                <span className="block truncate font-medium">{buildDisplayName(i)}</span>
                                <span className="font-mono text-xs text-muted-foreground">{i.sku}</span>
                              </span>
                              <span className="flex shrink-0 items-center gap-2">
                                <span className="font-mono text-xs tabular-nums">{priced ? formatUsd(i.priceCents!) : t('No price')}</span>
                                {already ? (
                                  <span className="text-xs text-muted-foreground">{t('Added')}</span>
                                ) : priced ? (
                                  <Plus className="h-4 w-4 text-brand" strokeWidth={2.5} />
                                ) : null}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              {stagedResolved.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">{t('Search above and tap a model to start building your order.')}</p>
              ) : (
                <ul className="space-y-2">
                  {stagedResolved.map((s) => (
                    <li key={s.variantId} className="flex items-center gap-3 rounded-xl border border-border p-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{buildDisplayName(s.item)}</span>
                        <span className="font-mono text-xs text-muted-foreground">{formatUsd(s.item.priceCents ?? 0)} · {formatUsd((s.item.priceCents ?? 0) * s.qty)}</span>
                      </span>
                      <input
                        type="number"
                        min={1}
                        value={s.qty}
                        onChange={(e) => setQty(s.variantId, parseInt(e.target.value, 10))}
                        className="h-9 w-20 rounded-lg border border-border bg-transparent px-2 text-center font-mono text-sm tabular-nums outline-none focus:border-brand [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                        aria-label={t('Quantity')}
                      />
                      <button onClick={() => unstage(s.variantId)} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive" aria-label={t('Remove')}>
                        <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <footer className="border-t border-border px-5 py-4">
              <Button variant="primary" size="lg" className="w-full" onClick={addAll} disabled={stagedResolved.length === 0}>
                <ShoppingBag className="h-4 w-4" strokeWidth={2} />
                {stagedResolved.length === 0
                  ? t('Nothing to add yet')
                  : `${t('Add')} ${totalUnits} ${totalUnits === 1 ? t('unit') : t('units')} · ${formatUsd(totalCents)}`}
              </Button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
