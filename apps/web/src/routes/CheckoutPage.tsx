import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, Lock, PackageCheck, ShoppingBag } from 'lucide-react';
import { useAccount, useCart } from '@/store';
import type { AccountOrder } from '@/store';
import { SUPPLIER_NAMES } from '@/data/catalog';
import { Button } from '@/components/ui/Button';
import { TierBadge } from '@/components/store/TierBadge';
import { ReserveFlow } from '@/components/store/ReserveFlow';
import { formatUsd } from '@/lib/format';

type Phase = 'review' | 'reserving' | 'done';

function genOrderId() {
  return 'OMP-' + Math.random().toString(16).slice(2, 8).toUpperCase();
}

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <input
        {...props}
        className="h-11 rounded-xl border border-border bg-background px-3.5 text-sm outline-none transition-colors focus:border-brand"
      />
    </label>
  );
}

export default function CheckoutPage() {
  const { lines, unitCount, effectiveTier, subtotalCents, retailSubtotalCents, savingsCents, clear } = useCart();
  const { placeOrder } = useAccount();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('review');
  const [orderId] = useState(genOrderId);
  const recorded = useRef(false);

  if (lines.length === 0 && phase !== 'done') {
    return (
      <div className="container flex flex-col items-center justify-center gap-4 py-24 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-muted">
          <ShoppingBag className="h-7 w-7 text-muted-foreground" strokeWidth={1.5} />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold">Nothing to check out</h1>
          <p className="mt-1 text-muted-foreground">Add a few phones and the right tier price is applied automatically.</p>
        </div>
        <Button onClick={() => navigate('/catalog')}>Browse catalog</Button>
      </div>
    );
  }

  function submitReview(e: FormEvent) {
    e.preventDefault();
    setPhase('reserving');
  }

  // Persist the order the moment the reserve flow settles, before the cart is
  // cleared — this is what makes it survive into the portal. Guarded so the
  // timer (and React's double-invoke in dev) can't record it twice.
  function handleReserved() {
    if (!recorded.current) {
      recorded.current = true;
      const order: AccountOrder = {
        id: orderId,
        placedAt: new Date().toISOString().slice(0, 10),
        units: unitCount,
        tierLabel: effectiveTier.label,
        subtotalCents,
        savingsCents,
        status: 'reserved',
        suppliers: [SUPPLIER_NAMES['source-1'], SUPPLIER_NAMES['source-2']],
        lines: lines.map((l) => ({
          model: l.item.model,
          image: l.item.image,
          color: l.color,
          storage: l.storage,
          qty: l.qty,
          unitPriceCents: l.unitPriceCents,
        })),
      };
      placeOrder(order);
    }
    setPhase('done');
  }

  return (
    <div className="container py-8 md:py-12">
      <h1 className="mb-6 font-display text-2xl font-semibold tracking-tight md:text-3xl">
        {phase === 'done' ? 'Order confirmed' : 'Checkout'}
      </h1>

      <div className="grid gap-8 lg:grid-cols-[1fr_380px] lg:gap-12">
        <div>
          {phase === 'review' && (
            <form onSubmit={submitReview} className="space-y-6">
              <section className="space-y-4 rounded-2xl border border-border p-5">
                <h2 className="font-medium">Contact &amp; business</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Work email" type="email" required placeholder="you@store.com" />
                  <Field label="Business name" required placeholder="Downtown Mobile LLC" />
                </div>
              </section>

              <section className="space-y-4 rounded-2xl border border-border p-5">
                <h2 className="font-medium">Shipping address</h2>
                <Field label="Street address" required placeholder="11816 Inwood Rd #1176" />
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="City" required placeholder="Dallas" />
                  <Field label="State" required placeholder="TX" />
                  <Field label="ZIP" required placeholder="75244" inputMode="numeric" />
                </div>
              </section>

              <section className="flex items-center gap-3 rounded-2xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                <Lock className="h-4 w-4 shrink-0" strokeWidth={2} />
                Payment is captured by Stripe in Order My Phones LLC&apos;s name — card data never touches this app.
              </section>

              <Button type="submit" size="lg" className="w-full">
                Reserve stock &amp; place order
              </Button>
            </form>
          )}

          {phase === 'reserving' && (
            <div className="rounded-2xl border border-border p-5">
              <h2 className="font-medium">Reserving your order at source</h2>
              <p className="mb-4 mt-1 text-sm text-muted-foreground">
                We confirm live stock with each supplier and hold your units before charging.
              </p>
              <ReserveFlow units={unitCount} onComplete={handleReserved} />
            </div>
          )}

          {phase === 'done' && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-2xl border border-border p-6"
            >
              <div className="flex items-center gap-3">
                <motion.span
                  initial={{ scale: 0.6 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 16 }}
                  className="grid h-12 w-12 place-items-center rounded-full bg-success text-white"
                >
                  <Check className="h-6 w-6" strokeWidth={3} />
                </motion.span>
                <div>
                  <p className="font-display text-lg font-semibold">Reserved &amp; confirmed</p>
                  <p className="font-mono text-sm text-muted-foreground">{orderId}</p>
                </div>
              </div>

              <div className="mt-5 space-y-2 rounded-xl bg-muted/50 p-4 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  <PackageCheck className="h-4 w-4 text-success" strokeWidth={2} />
                  {unitCount} {unitCount === 1 ? 'unit' : 'units'} reserved at source
                </div>
                <p className="text-muted-foreground">
                  Held at {SUPPLIER_NAMES['source-1']} &amp; {SUPPLIER_NAMES['source-2']}, cross-checked against open
                  orders. Tracking posts as each supplier dispatches.
                </p>
              </div>

              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                <Button
                  className="flex-1"
                  onClick={() => {
                    clear();
                    navigate('/catalog');
                  }}
                >
                  Continue shopping
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    clear();
                    navigate('/portal/orders');
                  }}
                >
                  Track order
                </Button>
              </div>
            </motion.div>
          )}
        </div>

        {/* Summary */}
        <aside className="lg:sticky lg:top-28 lg:self-start">
          <div className="rounded-2xl border border-border p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-medium">Order summary</h2>
              <TierBadge tier={effectiveTier} />
            </div>

            <ul className="divide-y divide-border">
              {lines.map((l) => (
                <li key={l.key} className="flex gap-3 py-3">
                  <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-muted/50">
                    <img src={l.item.image} alt={l.item.model} className="h-full w-full object-contain p-1" />
                  </div>
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{l.item.model}</p>
                      <p className="text-xs text-muted-foreground">
                        {l.color} · {l.storage}GB · ×{l.qty}
                      </p>
                    </div>
                    <span className="font-mono text-sm font-medium tabular-nums">{formatUsd(l.lineTotalCents)}</span>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-3 space-y-2 border-t border-border pt-4 text-sm">
              <Row label="Retail subtotal" value={formatUsd(retailSubtotalCents)} muted strike={savingsCents > 0} />
              {savingsCents > 0 && <Row label={`Tier savings · ${effectiveTier.label}`} value={`−${formatUsd(savingsCents)}`} accent />}
              <Row label="Shipping" value="Free" muted />
              <div className="flex items-center justify-between border-t border-border pt-3">
                <span className="font-medium">Total</span>
                <span className="font-mono text-xl font-semibold tabular-nums">{formatUsd(subtotalCents)}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  muted = false,
  accent = false,
  strike = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
  accent?: boolean;
  strike?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? 'text-muted-foreground' : ''}>{label}</span>
      <span
        className={[
          'font-mono tabular-nums',
          accent ? 'font-medium text-success' : '',
          strike ? 'text-muted-foreground line-through' : '',
        ].join(' ')}
      >
        {value}
      </span>
    </div>
  );
}
