import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, FileDown, Heart, Minus, Plus, Sheet, Trash2 } from 'lucide-react';
import { useAccount, useCart, useTier, useWishlist } from '@/store';
import { PageHeading } from '@/components/portal/parts';
import { Button, buttonVariants } from '@/components/ui/Button';
import { exportDocCsv, exportDocPdf, type ExportDoc } from '@/lib/export';
import { formatInt, formatUsd } from '@/lib/format';
import { cn } from '@/lib/utils';

const PRESETS = [10, 50, 100];

export default function WishlistPage() {
  const { lines, unitCount, subtotalCents, retailSubtotalCents, savingsCents, setQty, remove, clear } = useWishlist();
  const { add, setOpen } = useCart();
  const { businessName } = useAccount();
  const { tier } = useTier();
  const navigate = useNavigate();

  function buildDoc(): ExportDoc {
    return {
      title: 'Wishlist · bulk order draft',
      reference: `WISH-${new Date().toISOString().slice(0, 10)}`,
      business: businessName,
      tierLabel: tier.label,
      dateLabel: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      lines: lines.map((l) => ({
        model: l.item.model,
        variant: `${l.color} · ${l.storage}GB`,
        qty: l.qty,
        unitPriceCents: l.unitPriceCents,
        lineTotalCents: l.lineTotalCents,
      })),
      subtotalCents,
      savingsCents,
    };
  }

  function buildBulkOrder() {
    lines.forEach((l) => add(l.itemId, { color: l.color, storage: l.storage, qty: l.qty }));
    setOpen(false);
    navigate('/checkout');
  }

  if (lines.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeading title="Wishlist" subtitle="Save models here, set quantities, and turn the list into one bulk order." />
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border py-16 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-muted">
            <Heart className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
          </div>
          <div>
            <p className="font-medium">Your wishlist is empty</p>
            <p className="mt-1 text-sm text-muted-foreground">Tap the heart on any phone to start building a bulk order.</p>
          </div>
          <Link to="/catalog" className={cn(buttonVariants())}>
            Browse catalog
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeading
        title="Wishlist"
        subtitle="Set quantities, then turn the whole list into one bulk order — priced at your tier."
        action={
          <button onClick={clear} className="text-sm text-muted-foreground transition-colors hover:text-destructive">
            Clear all
          </button>
        }
      />

      {/* Desire table — one editable card per line */}
      <div className="space-y-3">
        {lines.map((l) => (
          <div key={l.key} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex gap-3">
              <div className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-muted/50">
                <img src={l.item.image} alt={l.item.model} className="h-full w-full object-contain p-1.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{l.item.model}</p>
                <p className="text-xs text-muted-foreground">
                  {l.color} · {l.storage}GB
                </p>
                <p className="mt-1 font-mono text-sm tabular-nums">
                  {formatUsd(l.unitPriceCents)} <span className="text-xs text-muted-foreground">/ unit</span>
                </p>
              </div>
              <button
                onClick={() => remove(l.key)}
                className="grid h-8 w-8 shrink-0 place-items-center self-start rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive"
                aria-label="Remove from wishlist"
              >
                <Trash2 className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center rounded-full border border-border">
                  <button onClick={() => setQty(l.key, l.qty - 1)} className="grid h-9 w-9 place-items-center rounded-l-full hover:bg-muted" aria-label="Decrease">
                    <Minus className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                  <input
                    value={l.qty}
                    onChange={(e) => setQty(l.key, Math.max(1, Math.min(9999, Number(e.target.value.replace(/\D/g, '')) || 1)))}
                    inputMode="numeric"
                    aria-label={`Quantity for ${l.item.model}`}
                    className="w-12 bg-transparent text-center font-mono text-sm font-semibold outline-none"
                  />
                  <button onClick={() => setQty(l.key, l.qty + 1)} className="grid h-9 w-9 place-items-center rounded-r-full hover:bg-muted" aria-label="Increase">
                    <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                </div>
                <div className="flex gap-1.5">
                  {PRESETS.map((n) => (
                    <button
                      key={n}
                      onClick={() => setQty(l.key, l.qty + n)}
                      className="rounded-full border border-border px-2.5 py-1.5 font-mono text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      +{n}
                    </button>
                  ))}
                </div>
              </div>
              <span className="font-mono text-sm font-semibold tabular-nums">{formatUsd(l.lineTotalCents)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Summary + actions */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Total units</p>
            <p className="mt-0.5 font-mono text-xl font-semibold tabular-nums">{formatInt(unitCount)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Subtotal · {tier.label}</p>
            <p className="mt-0.5 font-mono text-xl font-semibold tabular-nums">{formatUsd(subtotalCents)}</p>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <p className="text-xs text-muted-foreground">Tier savings vs retail</p>
            <p className="mt-0.5 font-mono text-xl font-semibold tabular-nums text-success">
              {savingsCents > 0 ? `−${formatUsd(savingsCents)}` : formatUsd(0)}
            </p>
            {retailSubtotalCents > subtotalCents && (
              <p className="font-mono text-xs text-muted-foreground line-through">{formatUsd(retailSubtotalCents)}</p>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Button size="lg" className="flex-1" onClick={buildBulkOrder}>
            Build bulk order · {formatInt(unitCount)} units
            <ArrowRight className="h-4 w-4" strokeWidth={2} />
          </Button>
          <Button variant="outline" size="lg" onClick={() => void exportDocPdf(buildDoc())}>
            <FileDown className="h-4 w-4" strokeWidth={2} />
            PDF
          </Button>
          <Button variant="outline" size="lg" onClick={() => exportDocCsv(buildDoc())}>
            <Sheet className="h-4 w-4" strokeWidth={2} />
            CSV
          </Button>
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground sm:text-left">
          Building a bulk order adds every line to your cart at your tier price, then takes you to checkout.
        </p>
      </section>
    </div>
  );
}
