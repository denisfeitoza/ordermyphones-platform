import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Minus, Plus, Trash2, X, ArrowRight, ShoppingBag } from 'lucide-react';
import { useCart } from '@/store';
import { unitsToNextTier } from '@/data/tiers';
import { Button } from '@/components/ui/Button';
import { TierBadge } from './TierBadge';
import { formatUsd } from '@/lib/format';
import { tierBg } from '@/lib/tierStyles';
import { cn } from '@/lib/utils';

export function CartDrawer() {
  const { open, setOpen, lines, unitCount, effectiveTier, subtotalCents, savingsCents, setQty, remove } = useCart();
  const navigate = useNavigate();
  const next = unitsToNextTier(unitCount);
  const pct = next ? Math.min(100, Math.round((unitCount / next.next.minUnits) * 100)) : 100;

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  function checkout() {
    setOpen(false);
    navigate('/checkout');
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <button
            className="absolute inset-0 cursor-default bg-foreground/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-label="Close cart"
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
                <h2 className="font-display text-lg font-semibold tracking-tight">Your cart</h2>
                {unitCount > 0 && <span className="font-mono text-sm text-muted-foreground">{unitCount} units</span>}
              </div>
              <button
                onClick={() => setOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-full hover:bg-muted"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            {lines.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
                <div className="grid h-16 w-16 place-items-center rounded-2xl bg-muted">
                  <ShoppingBag className="h-7 w-7 text-muted-foreground" strokeWidth={1.5} />
                </div>
                <div>
                  <p className="font-medium">Your cart is empty</p>
                  <p className="mt-1 text-sm text-muted-foreground">Add phones and the right tier price is applied automatically.</p>
                </div>
                <Button variant="primary" onClick={() => setOpen(false)}>
                  Browse catalog
                </Button>
              </div>
            ) : (
              <>
                <div className="border-b border-border bg-muted/40 px-5 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Pricing at</span>
                    <TierBadge tier={effectiveTier} showRange />
                  </div>
                  {next && (
                    <div className="mt-3 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          <span className="font-mono font-semibold text-foreground">{next.remaining}</span> more units →{' '}
                          <span className="font-medium text-foreground">{next.next.label}</span>
                        </span>
                        <span className="font-mono text-muted-foreground">{pct}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-border">
                        <motion.div
                          className={cn('h-full rounded-full', tierBg[next.next.tone])}
                          initial={false}
                          animate={{ width: `${pct}%` }}
                          transition={{ type: 'spring', stiffness: 200, damping: 28 }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <ul className="flex-1 divide-y divide-border overflow-y-auto px-5">
                  {lines.map((l) => (
                    <li key={l.key} className="flex gap-3 py-4">
                      <div className="grid h-20 w-20 shrink-0 place-items-center rounded-xl bg-muted/40">
                        <img src={l.item.image} alt={l.item.model} className="h-full w-full object-contain p-1.5" />
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{l.item.model}</p>
                            <p className="text-xs text-muted-foreground">
                              {l.color} · {l.storage}GB
                            </p>
                          </div>
                          <button
                            onClick={() => remove(l.key)}
                            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive"
                            aria-label="Remove"
                          >
                            <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                          </button>
                        </div>
                        <div className="mt-auto flex items-center justify-between pt-2">
                          <div className="inline-flex items-center rounded-full border border-border">
                            <button
                              onClick={() => setQty(l.key, l.qty - 1)}
                              className="grid h-8 w-8 place-items-center rounded-l-full hover:bg-muted"
                              aria-label="Decrease"
                            >
                              <Minus className="h-3.5 w-3.5" strokeWidth={2} />
                            </button>
                            <span className="w-9 text-center font-mono text-sm tabular-nums">{l.qty}</span>
                            <button
                              onClick={() => setQty(l.key, l.qty + 1)}
                              className="grid h-8 w-8 place-items-center rounded-r-full hover:bg-muted"
                              aria-label="Increase"
                            >
                              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                            </button>
                          </div>
                          <span className="font-mono text-sm font-semibold tabular-nums">
                            {formatUsd(l.lineTotalCents)}
                          </span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>

                <footer className="space-y-3 border-t border-border px-5 py-4">
                  {savingsCents > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Tier savings vs retail</span>
                      <span className="font-mono font-medium text-success">−{formatUsd(savingsCents)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Subtotal</span>
                    <span className="font-mono text-xl font-semibold tabular-nums">{formatUsd(subtotalCents)}</span>
                  </div>
                  <Button variant="primary" size="lg" className="w-full" onClick={checkout}>
                    Reserve &amp; checkout
                    <ArrowRight className="h-4 w-4" strokeWidth={2} />
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    Stock reserved at the source on checkout · taxes at next step
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
