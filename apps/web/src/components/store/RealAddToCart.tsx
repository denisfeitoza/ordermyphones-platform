import { useState } from 'react';
import { Minus, Plus, ShoppingBag, Check } from 'lucide-react';
import { useAuth, useRealCart } from '@/store';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

/**
 * Real-mode add-to-cart. Only a signed-in CUSTOMER with a visible tier price
 * can order — admin/staff have no tier and place no orders (server enforces
 * this in place_order; this just hides the affordance). No quantity is
 * blocked here: ordering above live stock is legal (D5 — the order holds no
 * stock; approval deducts what's available and reconciles the rest).
 */
export function RealAddToCart({
  variantId,
  priceCents,
  stepper = false,
  className,
}: {
  variantId: string;
  priceCents: number | null;
  stepper?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const { signedIn, role } = useAuth();
  const { add } = useRealCart();
  const [qty, setQty] = useState(1);
  const [justAdded, setJustAdded] = useState(false);

  // Not orderable: signed out, not a customer, or no price for this tier.
  if (!signedIn || role !== 'customer' || priceCents === null) return null;

  function addToCart() {
    add(variantId, stepper ? qty : 1);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1400);
  }

  if (!stepper) {
    return (
      <Button variant="primary" size="md" className={cn('w-full', className)} onClick={addToCart}>
        {justAdded ? <Check className="h-4 w-4" strokeWidth={2.5} /> : <ShoppingBag className="h-4 w-4" strokeWidth={2} />}
        {justAdded ? t('Added') : t('Add to cart')}
      </Button>
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
