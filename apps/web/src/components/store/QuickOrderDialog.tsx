import { useMemo, useState, type ClipboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X, ClipboardList, ShoppingBag, Plus, Trash2, Search, Eye } from 'lucide-react';
import { useAuth, useRealCart, useTier } from '@/store';
import { useRealCatalog, localizedDisplayName, type PricedRealListing } from '@/data/realCatalog';
import { canOrder } from '@/components/store/RealAddToCart';
import { TIERS } from '@/data/tiers';
import { Button } from '@/components/ui/Button';
import { formatInt, formatUsd } from '@/lib/format';
import { listingSearchText, matchesWords, searchWords } from '@/lib/realCatalogFacets';
import { QtyInput, clampQty } from '@/components/store/QtyInput';
import { useI18n } from '@/i18n';

/**
 * Quick-order builder (M2-P4). The buyer types words in any order ("13 128
 * iphone"), taps variants and sets quantities — or pastes a list straight from
 * a spreadsheet ("SKU<tab>qty" per line) — building a staged list they drop
 * into the cart in one action. Only priced, in-catalog variants are addable;
 * everything resolves live against the real catalog. Real mode only.
 */

interface StagedLine {
  variantId: string;
  qty: number;
}

export function QuickOrderDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const { items } = useRealCatalog(true);
  const { addMany } = useRealCart();
  const { role, signedIn } = useAuth();
  const { previewCode, startPreview } = useTier();
  const [query, setQuery] = useState('');
  const [staged, setStaged] = useState<StagedLine[]>([]);
  const [pasteReport, setPasteReport] = useState<{ added: number; missing: string[] } | null>(null);

  // Admin/staff have no customer tier, so every price resolves null and rows are
  // unaddable ("No price"). Offer an inline tier preview so pricing lights up
  // without leaving the dialog. Guests are pointed to request access instead.
  const needsTierPreview = (role === 'admin' || role === 'staff') && !previewCode;
  const guestNoPricing = !signedIn;

  const byVariant = useMemo(() => new Map(items.map((i) => [i.variantId, i])), [items]);
  const stagedIds = useMemo(() => new Set(staged.map((s) => s.variantId)), [staged]);

  const bySku = useMemo(() => new Map(items.map((i) => [i.sku.toUpperCase(), i])), [items]);

  const results = useMemo(() => {
    const words = searchWords(query);
    if (words.length === 0) return [] as PricedRealListing[];
    const out: PricedRealListing[] = [];
    for (const i of items) {
      if (matchesWords(listingSearchText(i), words)) out.push(i);
      if (out.length >= 40) break;
    }
    return out;
  }, [items, query]);

  /** A pasted list ("SKU<tab or , or ;>qty" per line) stages every SKU it finds. */
  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text');
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const looksLikeList = lines.length > 1 || /[\t,;]\s*\d+\s*$/.test(lines[0] ?? '');
    if (!looksLikeList) return;
    e.preventDefault();
    const found = new Map<string, number>();
    const missing: string[] = [];
    for (const line of lines) {
      const [rawSku = '', rawQty = ''] = line.split(/\t|[,;]|\s{2,}/).map((x) => x.trim());
      const item = bySku.get(rawSku.toUpperCase());
      if (!item || item.priceCents === null) {
        if (rawSku && !/^sku$/i.test(rawSku)) missing.push(rawSku);
        continue;
      }
      const q = Number.parseInt(rawQty.replace(/\D/g, ''), 10);
      found.set(item.variantId, clampQty((found.get(item.variantId) ?? 0) + (Number.isFinite(q) && q > 0 ? q : 1)));
    }
    setStaged((prev) => {
      const next = [...prev];
      for (const [variantId, qty] of found) {
        const i = next.findIndex((s) => s.variantId === variantId);
        if (i >= 0) next[i] = { variantId, qty: clampQty(next[i]!.qty + qty) };
        else next.push({ variantId, qty });
      }
      return next;
    });
    setPasteReport({ added: found.size, missing });
    setQuery('');
  }

  const stagedResolved = staged
    .map((s) => ({ ...s, item: byVariant.get(s.variantId) }))
    .filter((s): s is StagedLine & { item: PricedRealListing } => !!s.item);

  const totalUnits = stagedResolved.reduce((n, s) => n + s.qty, 0);
  const totalCents = stagedResolved.reduce((n, s) => n + (s.item.priceCents ?? 0) * s.qty, 0);

  function stage(variantId: string) {
    setStaged((prev) => (prev.some((s) => s.variantId === variantId) ? prev : [...prev, { variantId, qty: 1 }]));
  }
  function setQty(variantId: string, qty: number) {
    const n = clampQty(qty);
    setStaged((prev) => prev.map((s) => (s.variantId === variantId ? { ...s, qty: n } : s)));
  }
  function unstage(variantId: string) {
    setStaged((prev) => prev.filter((s) => s.variantId !== variantId));
  }
  function addAll() {
    // Same gate as RealAddToCart: only a signed-in customer with a resolved
    // price can put a line in the cart — an admin in a tier lens must not
    // build a preview-priced cart (audit 2026-09-13).
    addMany(stagedResolved.filter((s) => canOrder(signedIn, role, s.item.priceCents)).map((s) => ({ variantId: s.item.variantId, qty: s.qty })));
    setStaged([]);
    setQuery('');
    setPasteReport(null);
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
                  onPaste={onPaste}
                  placeholder={t('Search a model — iPhone 15 Pro, Galaxy, SKU…')}
                  className="h-11 w-full rounded-xl border border-border bg-muted/30 pl-9 pr-3 text-sm outline-none transition-colors focus:border-brand"
                />
              </label>

              {needsTierPreview ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-brand/25 bg-brand/5 px-3 py-2.5 text-xs">
                  <Eye className="h-4 w-4 shrink-0 text-brand" strokeWidth={2} />
                  <span className="font-medium text-foreground">{t('Preview pricing as')}</span>
                  <div className="flex flex-wrap gap-1">
                    {TIERS.map((tr) => (
                      <button
                        key={tr.code}
                        type="button"
                        onClick={() => startPreview(tr.code)}
                        title={tr.label}
                        className="rounded-full border border-border bg-background px-2.5 py-1 font-mono text-[0.65rem] font-bold text-muted-foreground transition-colors hover:border-brand hover:text-foreground"
                      >
                        {tr.short}
                      </button>
                    ))}
                  </div>
                </div>
              ) : guestNoPricing ? (
                <p className="mt-2 rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
                  {t('Pricing shows once your account is approved.')}{' '}
                  <Link to="/request-access" className="font-medium text-brand hover:underline" onClick={onClose}>
                    {t('Request access')}
                  </Link>
                </p>
              ) : null}

              <p className="mt-1.5 text-xs text-muted-foreground">{t('Tip: paste a list from your spreadsheet — one SKU and quantity per line.')}</p>
              {pasteReport && (
                <p className="mt-2 rounded-xl bg-muted/50 px-3 py-2 text-xs" role="status">
                  {formatInt(pasteReport.added)} {pasteReport.added === 1 ? t('SKU added to the list') : t('SKUs added to the list')}
                  {pasteReport.missing.length > 0 && (
                    <span className="text-destructive">
                      {' · '}
                      {formatInt(pasteReport.missing.length)} {t('not found or not priced')}: <span className="font-mono">{pasteReport.missing.slice(0, 12).join(', ')}{pasteReport.missing.length > 12 ? '…' : ''}</span>
                    </span>
                  )}
                </p>
              )}

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
                                <span className="block truncate font-medium">{localizedDisplayName(i, t)}</span>
                                <span className="block truncate text-xs text-muted-foreground">
                                  {t(i.ctiaLabel)}
                                  {i.color ? ` · ${i.color}` : ''} · <span className="font-mono">{i.sku}</span>
                                </span>
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
                        <span className="block truncate text-sm font-medium">{localizedDisplayName(s.item, t)}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {t(s.item.ctiaLabel)}
                          {s.item.color ? ` · ${s.item.color}` : ''} · <span className="font-mono">{formatUsd(s.item.priceCents ?? 0)} · {formatUsd((s.item.priceCents ?? 0) * s.qty)}</span>
                        </span>
                      </span>
                      <QtyInput
                        value={s.qty}
                        onChange={(n) => setQty(s.variantId, n)}
                        className="h-11 w-20 rounded-lg border border-border bg-transparent px-2 text-center font-mono text-sm tabular-nums outline-none focus:border-brand"
                        aria-label={t('Quantity')}
                      />
                      <button onClick={() => unstage(s.variantId)} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive" aria-label={t('Remove')}>
                        <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <footer className="border-t border-border px-5 py-4">
              <Button
                variant="primary"
                size="lg"
                className="w-full"
                onClick={addAll}
                disabled={stagedResolved.length === 0 || !stagedResolved.some((s) => canOrder(signedIn, role, s.item.priceCents))}
              >
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
