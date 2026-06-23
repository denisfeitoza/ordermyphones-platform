import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Minus, Plus, ShieldCheck, Truck, RotateCcw, ChevronRight, ArrowUpRight } from 'lucide-react';
import { CATALOG, getItemBySlug, totalAvailable, unitPriceCents } from '@/data/catalog';
import { maxTier, resolveTierByUnits, tierByCode, unitsToNextTier } from '@/data/tiers';
import { useCart, useTier } from '@/store';
import { Button } from '@/components/ui/Button';
import { Badge, badgeTone } from '@/components/ui/Badge';
import { Stars } from '@/components/ui/Stars';
import { TierBadge } from '@/components/store/TierBadge';
import { TierLadder } from '@/components/store/TierLadder';
import { PulseDot } from '@/components/store/SyncHeartbeat';
import { ProductGrid } from '@/components/store/ProductGrid';
import { formatInt, formatUsd } from '@/lib/format';
import { cn } from '@/lib/utils';

export default function ProductPage() {
  const { slug } = useParams<{ slug: string }>();
  const item = slug ? getItemBySlug(slug) : undefined;
  const { tier: storedTier } = useTier();
  const { add, setOpen } = useCart();
  const navigate = useNavigate();

  const [color, setColor] = useState(item?.colors[0].name ?? '');
  const [storage, setStorage] = useState(item?.storage[0] ?? 0);
  const [qty, setQty] = useState(1);

  const related = useMemo(
    () => (item ? CATALOG.filter((i) => i.brand === item.brand && i.id !== item.id).slice(0, 3) : []),
    [item],
  );

  if (!item) {
    return (
      <div className="container flex flex-col items-center gap-4 py-24 text-center">
        <h1 className="font-display text-2xl font-semibold">Phone not found</h1>
        <p className="text-muted-foreground">That model isn’t in the catalog.</p>
        <Link to="/catalog" className="text-sm font-medium text-brand hover:underline">
          Back to catalog
        </Link>
      </div>
    );
  }

  const effectiveTier = tierByCode(maxTier(storedTier.code, resolveTierByUnits(qty).code));
  const unit = unitPriceCents(item, effectiveTier.code);
  const retail = unitPriceCents(item, 'tier_1');
  const lineTotal = unit * qty;
  const next = unitsToNextTier(qty);
  const available = totalAvailable(item);
  const soldOut = available === 0;

  function addToCart() {
    add(item!.id, { color, storage, qty });
  }
  function buyNow() {
    add(item!.id, { color, storage, qty });
    setOpen(false);
    navigate('/checkout');
  }

  return (
    <div className="container py-6 md:py-10">
      <nav className="mb-6 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link to="/catalog" className="hover:text-foreground">Catalog</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link to={`/catalog?brand=${item.brand}`} className="hover:text-foreground">{item.brand}</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">{item.model}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        {/* Gallery */}
        <div className="lg:sticky lg:top-28 lg:self-start">
          <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-b from-muted/50 to-muted/20">
            <div className="absolute left-4 top-4 z-10 flex flex-col gap-1.5">
              {item.badges.map((b) => (
                <Badge key={b} tone={badgeTone(b)}>{b}</Badge>
              ))}
            </div>
            <motion.img
              key={item.id}
              src={item.image}
              alt={item.model}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="aspect-square w-full object-contain p-8"
            />
          </div>
        </div>

        {/* Buy box */}
        <div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground">{item.brand}</span>
            <span className="text-muted-foreground">·</span>
            <Stars rating={item.rating} reviews={item.reviews} />
          </div>
          <h1 className="mt-1.5 font-display text-3xl font-semibold tracking-tight md:text-4xl">{item.model}</h1>

          <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-mono text-3xl font-semibold tabular-nums">{formatUsd(unit)}</span>
            {retail > unit && (
              <span className="font-mono text-sm text-muted-foreground line-through">{formatUsd(retail)}</span>
            )}
            <span className="text-sm text-muted-foreground">/ unit</span>
            <TierBadge tier={effectiveTier} className="ml-auto" />
          </div>

          {/* Color */}
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium">Color</span>
              <span className="text-sm text-muted-foreground">{color}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {item.colors.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => setColor(c.name)}
                  title={c.name}
                  className={cn(
                    'h-9 w-9 rounded-full border transition-all',
                    color === c.name ? 'ring-2 ring-brand ring-offset-2 ring-offset-background' : 'border-border hover:scale-105',
                  )}
                  style={{ backgroundColor: c.hex }}
                  aria-label={c.name}
                />
              ))}
            </div>
          </div>

          {/* Storage */}
          <div className="mt-6">
            <span className="mb-2 block text-sm font-medium">Storage</span>
            <div className="flex flex-wrap gap-2">
              {item.storage.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStorage(s)}
                  className={cn(
                    'rounded-xl border px-4 py-2 text-sm font-medium transition-colors',
                    storage === s ? 'border-foreground bg-foreground text-background' : 'border-border hover:bg-muted',
                  )}
                >
                  {s >= 1024 ? `${s / 1024}TB` : `${s}GB`}
                </button>
              ))}
            </div>
          </div>

          {/* Quantity + volume break */}
          <div className="mt-6">
            <span className="mb-2 block text-sm font-medium">Quantity</span>
            <div className="flex items-center gap-3">
              <div className="inline-flex items-center rounded-full border border-border">
                <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="grid h-11 w-11 place-items-center rounded-l-full hover:bg-muted" aria-label="Decrease">
                  <Minus className="h-4 w-4" strokeWidth={2} />
                </button>
                <input
                  value={qty}
                  onChange={(e) => setQty(Math.max(1, Math.min(999, Number(e.target.value.replace(/\D/g, '')) || 1)))}
                  inputMode="numeric"
                  className="w-14 bg-transparent text-center font-mono text-sm font-semibold outline-none"
                  aria-label="Quantity"
                />
                <button onClick={() => setQty((q) => Math.min(999, q + 1))} className="grid h-11 w-11 place-items-center rounded-r-full hover:bg-muted" aria-label="Increase">
                  <Plus className="h-4 w-4" strokeWidth={2} />
                </button>
              </div>
              <div className="flex gap-1.5">
                {[10, 50, 100].map((n) => (
                  <button key={n} onClick={() => setQty(n)} className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
                    {n}
                  </button>
                ))}
              </div>
            </div>
            {next && (
              <p className="mt-2.5 text-sm text-muted-foreground">
                Add <span className="font-mono font-semibold text-foreground">{next.remaining}</span> more to unlock{' '}
                <span className="font-medium text-foreground">{next.next.label}</span> pricing.
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button variant="outline" size="lg" className="flex-1" disabled={soldOut} onClick={addToCart}>
              Add to cart · {formatUsd(lineTotal)}
            </Button>
            <Button variant="primary" size="lg" className="flex-1" disabled={soldOut} onClick={buyNow}>
              {soldOut ? 'Sold out' : 'Reserve & buy'}
            </Button>
          </div>

          {/* Tier ladder */}
          <div className="mt-8 rounded-2xl border border-border p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Volume pricing</h2>
              <span className="text-xs text-muted-foreground">Auto-applied at checkout</span>
            </div>
            <TierLadder item={item} qty={qty} />
          </div>

          {/* Availability (sources kept private) */}
          <div className="mt-6 rounded-2xl border border-border p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Availability</h2>
              <span className="font-mono text-xs text-muted-foreground">{formatInt(available)} in stock</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <PulseDot status={available > 0 ? 'online' : 'degraded'} />
              <span className="text-muted-foreground">
                {available > 0
                  ? 'Live stock confirmed and reserved at source — ships in 1–2 business days'
                  : 'Out of stock — restock in progress'}
              </span>
            </div>
          </div>

          {/* Trust */}
          <div className="mt-6 grid grid-cols-3 gap-3 text-xs">
            {[
              { icon: ShieldCheck, label: '12-month warranty' },
              { icon: Truck, label: 'Ships from US stock' },
              { icon: RotateCcw, label: '30-day returns' },
            ].map((t) => (
              <div key={t.label} className="flex flex-col items-center gap-1.5 rounded-xl bg-muted/50 p-3 text-center text-muted-foreground">
                <t.icon className="h-4 w-4" strokeWidth={1.75} />
                {t.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-16 md:mt-24">
          <div className="mb-6 flex items-end justify-between">
            <h2 className="font-display text-xl font-semibold tracking-tight md:text-2xl">More {item.brand}</h2>
            <Link to={`/catalog?brand=${item.brand}`} className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:gap-2">
              View all <ArrowUpRight className="h-4 w-4" strokeWidth={2} />
            </Link>
          </div>
          <ProductGrid items={related} />
        </section>
      )}
    </div>
  );
}
