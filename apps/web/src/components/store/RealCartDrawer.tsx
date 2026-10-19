import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Minus, Plus, Trash2, X, ArrowRight, ShoppingBag, Smartphone, LogIn } from 'lucide-react';
import { useRealCart, type RealCartAllocation } from '@/store';
import { useCatalogSource } from '@/lib/catalogSource';
import { useOrderLocationSelection } from '@/lib/orderSettings';
import { useRealCatalog, localizedDisplayName, type PricedRealListing } from '@/data/realCatalog';
import { listingImage } from '@/lib/productImage';
import { CartLineLocations, allocationValid } from './CartLineLocations';
import { QtyInput, clampQty } from './QtyInput';
import { Button } from '@/components/ui/Button';
import { formatUsd } from '@/lib/format';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

interface ResolvedLine {
  variantId: string;
  qty: number;
  allocations?: RealCartAllocation[] | undefined;
  item: PricedRealListing | undefined;
  lineTotalCents: number | null;
}

/**
 * Real-mode cart drawer. Always mounted (like CartDrawer) but only fetches the
 * catalog while it is OPEN in real mode — `useRealCatalog(isReal && open)`
 * gates BOTH queries, so mock mode and pages that never open the cart (portal
 * orders, account) skip the ~1.4 MB listing download. The listing query shares
 * React Query's 'catalog-listing' cache with the catalog page, so opening the
 * drawer after browsing adds no extra network. Prices are resolved here from
 * the server-tier-priced feed, never carried in the cart itself.
 */
export function RealCartDrawer() {
  const { t } = useI18n();
  const source = useCatalogSource();
  const isReal = source === 'real';
  const { open, setOpen, lines, unitCount, setQty, setAllocations, remove, clear } = useRealCart();
  const [confirmClear, setConfirmClear] = useState(false);
  const { items, isLoading, pricesReady: pricesLoaded, pricesError, retryPrices, signedIn } = useRealCatalog(isReal && open);
  const locationSelection = useOrderLocationSelection();
  const navigate = useNavigate();

  // Warm the checkout chunk while the cart is open, so "Review & place order"
  // does not hide the whole page behind the route loader for a moment.
  useEffect(() => {
    if (open && isReal) void import('@/routes/CheckoutPage');
  }, [open, isReal]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen]);

  const byVariant = useMemo(() => new Map(items.map((i) => [i.variantId, i])), [items]);
  const resolved: ResolvedLine[] = useMemo(
    () =>
      lines.map((l) => {
        const item = byVariant.get(l.variantId);
        const price = item?.priceCents ?? null;
        return { ...l, item, lineTotalCents: price === null ? null : price * l.qty };
      }),
    [lines, byVariant],
  );

  const subtotalCents = resolved.reduce((s, l) => s + (l.lineTotalCents ?? 0), 0);
  // Block checkout only when a line has an in-progress split that doesn't sum to
  // its qty (all-or-nothing). Lines with no split are always valid.
  const allocationsValid = resolved.every((l) => allocationValid(l));
  // A guest has no tier price: prices are never fetched, so every line reads
  // "—". Sending them to sign in is the next step, not a dead button.
  const needsSignIn = !signedIn;
  // Prices still on the way (or failed) are NOT "no longer available": only a
  // line missing from the listing, or unpriced once prices loaded fine, is.
  const pricesLoading = signedIn && !pricesLoaded;
  const pricesSettled = !isLoading && pricesLoaded && !pricesError;
  // Every line must have a resolved tier price before checkout — otherwise
  // the subtotal shown undercounts and place_order would price lines the
  // buyer never saw (audit 2026-09-13 P2).
  const allPriced = resolved.length > 0 && resolved.every((l) => l.lineTotalCents !== null);
  const unavailable = pricesSettled && signedIn ? resolved.filter((l) => l.lineTotalCents === null) : [];
  const canCheckout = !needsSignIn && allPriced && allocationsValid;

  function checkout() {
    if (needsSignIn) {
      setOpen(false);
      navigate('/auth/sign-in', { state: { from: '/checkout' } });
      return;
    }
    if (!canCheckout) return;
    setOpen(false);
    navigate('/checkout');
  }

  // In mock mode this drawer is inert (its `open` is never set true) and it
  // renders nothing — the mock <CartDrawer> is the active one.
  if (!isReal) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <button
            className="absolute inset-0 cursor-default bg-foreground/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-label={t('Close cart')}
          />
          <motion.aside
            className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-background shadow-2xl"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 260, damping: 30 }}
          >
            <header className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-lg font-semibold tracking-tight">{t('Your cart')}</h2>
                {unitCount > 0 && (
                  <span className="font-mono text-sm text-muted-foreground">
                    {lines.length} {lines.length === 1 ? t('line') : t('lines')} · {unitCount} {unitCount === 1 ? t('unit') : t('units')}
                  </span>
                )}
              </div>
              {lines.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirmClear) {
                      clear();
                      setConfirmClear(false);
                    } else setConfirmClear(true);
                  }}
                  onBlur={() => setConfirmClear(false)}
                  className={cn('ml-auto mr-1 min-h-11 rounded-full px-3 text-xs font-medium', confirmClear ? 'bg-destructive text-white' : 'text-muted-foreground hover:bg-muted')}
                >
                  {confirmClear ? t('Tap again to empty the cart') : t('Empty cart')}
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="-mr-1.5 grid h-11 w-11 place-items-center rounded-full hover:bg-muted"
                aria-label={t('Close')}
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            {resolved.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
                <div className="grid h-16 w-16 place-items-center rounded-2xl bg-muted">
                  <ShoppingBag className="h-7 w-7 text-muted-foreground" strokeWidth={1.5} />
                </div>
                <div>
                  <p className="font-medium">{t('Your cart is empty')}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{t('Add phones and the right tier price is applied automatically.')}</p>
                </div>
                <Button variant="primary" onClick={() => setOpen(false)}>
                  {t('Browse catalog')}
                </Button>
              </div>
            ) : (
              <>
                <ul className="flex-1 divide-y divide-border overflow-y-auto px-5">
                  {resolved.map((l) => {
                    const image = l.item ? listingImage(l.item) : null;
                    const name = l.item ? localizedDisplayName(l.item, t) : isLoading ? t('Loading…') : t('Item unavailable');
                    return (
                      <li key={l.variantId} className="flex gap-3 py-4">
                        <div className="grid h-20 w-20 shrink-0 place-items-center rounded-xl bg-muted/40">
                          {image ? (
                            <img src={image} alt={name} className="h-full w-full object-contain p-1.5" />
                          ) : (
                            <Smartphone className="h-8 w-8 text-muted-foreground/50" strokeWidth={1.25} />
                          )}
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{name}</p>
                              {l.item ? (
                                <p className="truncate text-xs text-muted-foreground">
                                  {t(l.item.ctiaLabel)}
                                  {l.item.color ? ` · ${l.item.color}` : ''}
                                </p>
                              ) : pricesSettled ? (
                                <p className="text-xs text-destructive">{t('No longer available — remove it to check out')}</p>
                              ) : null}
                            </div>
                            <button
                              onClick={() => remove(l.variantId)}
                              className="-m-2 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive"
                              aria-label={t('Remove')}
                            >
                              <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                            </button>
                          </div>
                          <div className="mt-auto flex items-center justify-between pt-2">
                            <div className="inline-flex items-center rounded-full border border-border">
                              <button
                                type="button"
                                onClick={() => setQty(l.variantId, l.qty - 1)}
                                className="grid h-11 w-11 place-items-center rounded-l-full hover:bg-muted"
                                aria-label={t('Decrease')}
                              >
                                <Minus className="h-3.5 w-3.5" strokeWidth={2} />
                              </button>
                              {/* Typeable: going from 300 to 250 is one edit, not 50 taps. */}
                              <QtyInput
                                value={l.qty}
                                onChange={(n) => setQty(l.variantId, n)}
                                aria-label={t('Quantity')}
                                className="h-11 w-14 border-x border-border bg-transparent text-center font-mono text-sm tabular-nums outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => setQty(l.variantId, clampQty(l.qty + 1))}
                                className="grid h-11 w-11 place-items-center rounded-r-full hover:bg-muted"
                                aria-label={t('Increase')}
                              >
                                <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                              </button>
                            </div>
                            <span className="font-mono text-sm font-semibold tabular-nums">
                              {l.lineTotalCents !== null ? formatUsd(l.lineTotalCents) : pricesLoading || isLoading ? '…' : '—'}
                            </span>
                          </div>
                          {l.item && (
                            <CartLineLocations
                              item={l.item}
                              qty={l.qty}
                              allocations={l.allocations}
                              enabled={locationSelection}
                              onChange={(a) => setAllocations(l.variantId, a)}
                            />
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <footer className="space-y-3 border-t border-border px-5 py-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{t('Subtotal')}</span>
                    <span className="font-mono text-xl font-semibold tabular-nums">{formatUsd(subtotalCents)}</span>
                  </div>
                  {/* Never a silent dead button: when it cannot advance, the reason
                      is right under it (sign in, prices loading/failed, a line). */}
                  {needsSignIn ? (
                    <Button variant="primary" size="lg" className="w-full" onClick={checkout}>
                      <LogIn className="h-4 w-4" strokeWidth={2} />
                      {t('Sign in to see your prices and order')}
                    </Button>
                  ) : (
                    <Button variant="primary" size="lg" className="w-full" onClick={checkout} disabled={!canCheckout}>
                      {pricesLoading || isLoading ? t('Loading your prices…') : t('Review & place order')}
                      {!(pricesLoading || isLoading) && <ArrowRight className="h-4 w-4" strokeWidth={2} />}
                    </Button>
                  )}
                  {pricesError && (
                    <p className="text-center text-xs text-destructive">
                      {t('Could not load your prices.')}{' '}
                      <button type="button" onClick={retryPrices} className="min-h-11 px-1 font-medium underline">
                        {t('Try again')}
                      </button>
                    </p>
                  )}
                  {!allocationsValid && (
                    <p className="text-center text-xs text-warning">{t('Finish allocating each line across locations to continue.')}</p>
                  )}
                  {unavailable.length > 0 && (
                    <div className="flex flex-wrap items-center justify-center gap-2 text-center text-xs text-destructive">
                      <span>
                        {unavailable.length} {unavailable.length === 1 ? t('line is no longer available.') : t('lines are no longer available.')}
                      </span>
                      <button type="button" onClick={() => unavailable.forEach((l) => remove(l.variantId))} className="min-h-11 rounded-full px-3 font-medium underline">
                        {t('Remove them')}
                      </button>
                    </div>
                  )}
                  <p className="text-center text-xs text-muted-foreground">
                    {t('Stock is confirmed when our team approves your order — nothing is charged here.')}
                  </p>
                </footer>
              </>
            )}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
