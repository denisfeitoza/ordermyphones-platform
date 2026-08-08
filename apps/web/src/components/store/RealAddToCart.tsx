import { useState } from 'react';
import { Minus, Plus, ShoppingBag, Check } from 'lucide-react';
import { useAuth, useRealCart } from '@/store';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

export type AddToCartLayout = 'button' | 'stepper' | 'row';

/** The single source of truth for "can this account order this SKU": a
 * signed-in customer with a visible tier price. Admin/staff have no tier and
 * place no orders (server enforces this in place_order; the UI just hides the
 * affordance). Exported so the table view can decide, without drift, whether
 * to render the order control or a "View details" fallback. */
export function canOrder(signedIn: boolean, role: string | null | undefined, priceCents: number | null): boolean {
  return signedIn && role === 'customer' && priceCents !== null;
}

/**
 * Real-mode add-to-cart. Only a signed-in CUSTOMER with a visible tier price
 * can order (see canOrder). No quantity is blocked here: ordering above live
 * stock is legal (D5 — the order holds no stock; approval deducts what's
 * available and reconciles the rest). Three layouts: `button` (card),
 * `stepper` (product detail, large), `row` (dense table, compact).
 */
export function RealAddToCart({
  variantId,
  priceCents,
  stepper = false,
  layout,
  className,
}: {
  variantId: string;
  priceCents: number | null;
  stepper?: boolean;
  layout?: AddToCartLayout;
  className?: string;
}) {
  const { t } = useI18n();
  const { signedIn, role } = useAuth();
  const { add } = useRealCart();
  const [qty, setQty] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const mode: AddToCartLayout = layout ?? (stepper ? 'stepper' : 'button');
  const withQty = mode !== 'button';

  if (!canOrder(signedIn, role, priceCents)) return null;

  function addToCart() {
    add(variantId, withQty ? qty : 1);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1400);
  }

  // Card popover: confirm a quantity (default 1, editable to any amount) before
  // adding, so a buyer can drop 300 units from the grid without opening detail.
  function confirmFromPopover() {
    add(variantId, qty);
    setPopoverOpen(false);
    setQty(1);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1400);
  }

  // Compact inline control for dense table rows: small stepper + icon add.
  if (mode === 'row') {
    return (
      <div className={cn('flex items-center gap-1.5', className)}>
        <div className="inline-flex items-center rounded-full border border-border">
          <button type="button" onClick={() => setQty((n) => Math.max(1, n - 1))} className="grid h-9 w-9 place-items-center rounded-l-full hover:bg-muted" aria-label={t('Decrease')}>
            <Minus className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
          <input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
            className="h-9 w-11 border-x border-border bg-transparent text-center font-mono text-sm tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            aria-label={t('Quantity')}
          />
          <button type="button" onClick={() => setQty((n) => n + 1)} className="grid h-9 w-9 place-items-center rounded-r-full hover:bg-muted" aria-label={t('Increase')}>
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>
        <Button variant="primary" size="sm" className="h-9 px-3" onClick={addToCart} aria-label={t('Add to cart')}>
          {justAdded ? <Check className="h-4 w-4" strokeWidth={2.5} /> : <ShoppingBag className="h-4 w-4" strokeWidth={2} />}
        </Button>
      </div>
    );
  }

  if (mode === 'button') {
    return (
      <div className={cn('relative', className)}>
        <Button variant="primary" size="md" className="w-full" onClick={() => setPopoverOpen((o) => !o)} aria-expanded={popoverOpen}>
          {justAdded ? <Check className="h-4 w-4" strokeWidth={2.5} /> : <ShoppingBag className="h-4 w-4" strokeWidth={2} />}
          {justAdded ? t('Added') : t('Add to cart')}
        </Button>
        {popoverOpen && (
          <>
            <button type="button" aria-hidden className="fixed inset-0 z-40 cursor-default" onClick={() => setPopoverOpen(false)} tabIndex={-1} />
            <div className="absolute bottom-full left-0 right-0 z-50 mb-2 rounded-xl border border-border bg-background p-2 shadow-card-hover">
              <div className="flex items-center gap-2">
                <div className="inline-flex flex-1 items-center rounded-full border border-border">
                  <button type="button" onClick={() => setQty((n) => Math.max(1, n - 1))} className="grid h-9 w-9 shrink-0 place-items-center rounded-l-full hover:bg-muted" aria-label={t('Decrease')}>
                    <Minus className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                  <input
                    type="number"
                    min={1}
                    autoFocus
                    value={qty}
                    onChange={(e) => setQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                    onKeyDown={(e) => e.key === 'Enter' && confirmFromPopover()}
                    className="h-9 w-full min-w-0 border-x border-border bg-transparent text-center font-mono text-sm tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                    aria-label={t('Quantity')}
                  />
                  <button type="button" onClick={() => setQty((n) => n + 1)} className="grid h-9 w-9 shrink-0 place-items-center rounded-r-full hover:bg-muted" aria-label={t('Increase')}>
                    <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                </div>
                <Button variant="primary" size="sm" className="h-9 shrink-0" onClick={confirmFromPopover}>
                  {t('Add')} {qty}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className="inline-flex items-center rounded-full border border-border">
        <button
          type="button"
          onClick={() => setQty((n) => Math.max(1, n - 1))}
          className="grid h-11 w-11 place-items-center rounded-l-full hover:bg-muted"
          aria-label={t('Decrease')}
        >
          <Minus className="h-4 w-4" strokeWidth={2} />
        </button>
        <input
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
          className="h-11 w-14 border-x border-border bg-transparent text-center font-mono text-sm tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          aria-label={t('Quantity')}
        />
        <button
          type="button"
          onClick={() => setQty((n) => n + 1)}
          className="grid h-11 w-11 place-items-center rounded-r-full hover:bg-muted"
          aria-label={t('Increase')}
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>
      <Button variant="primary" size="lg" className="flex-1" onClick={addToCart}>
        {justAdded ? <Check className="h-4 w-4" strokeWidth={2.5} /> : <ShoppingBag className="h-4 w-4" strokeWidth={2} />}
        {justAdded ? t('Added to cart') : t('Add to cart')}
      </Button>
    </div>
  );
}
