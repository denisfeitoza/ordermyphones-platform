import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Check, Loader2, MapPin, RotateCcw, Truck } from 'lucide-react';
import { useAccount, useCart, type AccountOrder } from '@/store';
import { CATALOG } from '@/data/catalog';
import { STATUS_META, StatusPill } from '@/components/portal/OrderCard';
import { Button, buttonVariants } from '@/components/ui/Button';
import { formatUsd } from '@/lib/format';
import { cn } from '@/lib/utils';

const STAGES = [
  { key: 'reserved', label: 'Reserved at source', offsetDays: 0 },
  { key: 'processing', label: 'Processing', offsetDays: 0 },
  { key: 'shipped', label: 'Shipped', offsetDays: 1 },
  { key: 'delivered', label: 'Delivered', offsetDays: 3 },
] as const;

function stageDate(placedAt: string, offsetDays: number): Date {
  const d = new Date(`${placedAt}T09:00:00`);
  d.setDate(d.getDate() + offsetDays);
  return d;
}

const fmtDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** Deterministic UPS-style tracking number derived from the order id (stable across renders). */
function trackingNo(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const digits = String(h).padStart(12, '0').slice(0, 12);
  return `1Z${digits.slice(0, 3)}W${digits.slice(3, 7)}${digits.slice(7, 12)}`.toUpperCase();
}

function Timeline({ order }: { order: AccountOrder }) {
  const cur = STATUS_META[order.status].step;
  const tn = trackingNo(order.id);

  return (
    <ol className="relative">
      {STAGES.map((s, i) => {
        const reached = i <= cur;
        const isCurrent = i === cur;
        const date = stageDate(order.placedAt, s.offsetDays);
        return (
          <li key={s.key} className="flex gap-3.5 pb-5 last:pb-0">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  'grid h-7 w-7 shrink-0 place-items-center rounded-full',
                  reached ? cn(STATUS_META[s.key].dot, 'text-white') : 'border border-border bg-card text-muted-foreground',
                )}
              >
                {isCurrent && order.status !== 'delivered' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : reached ? (
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                )}
              </span>
              {i < STAGES.length - 1 && <span className={cn('mt-1 w-px flex-1', i < cur ? 'bg-foreground/25' : 'bg-border')} />}
            </div>

            <div className="min-w-0 flex-1 pt-0.5">
              <p className={cn('text-sm', reached ? 'font-medium' : 'text-muted-foreground')}>{s.label}</p>
              <p className="font-mono text-xs text-muted-foreground">
                {reached ? fmtDate(date) : `Est. ${fmtDate(date)}`}
              </p>
              {s.key === 'shipped' && cur >= 2 && (
                <p className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-muted px-2 py-1 font-mono text-xs">
                  <Truck className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2} />
                  UPS · {tn}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default function OrderDetailPage() {
  const { id } = useParams();
  const { orders } = useAccount();
  const { add, setOpen } = useCart();
  const order = orders.find((o) => o.id === id);

  if (!order) {
    return (
      <div className="space-y-4">
        <Link to="/portal/orders" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" strokeWidth={2} />
          Back to orders
        </Link>
        <div className="rounded-2xl border border-dashed border-border py-16 text-center">
          <p className="font-medium">Order not found</p>
          <p className="mt-1 text-sm text-muted-foreground">It may have been placed on another device.</p>
        </div>
      </div>
    );
  }

  const retailCents = order.subtotalCents + order.savingsCents;

  function reorder() {
    if (!order) return;
    order.lines.forEach((l) => {
      const item = CATALOG.find((c) => c.model === l.model);
      if (item) add(item.id, { qty: l.qty, color: l.color, storage: l.storage });
    });
    setOpen(true);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-6"
    >
      <Link to="/portal/orders" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" strokeWidth={2} />
        Back to orders
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-mono text-2xl font-semibold tracking-tight">{order.id}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Placed {fmtDate(new Date(`${order.placedAt}T09:00:00`))} · {order.units} {order.units === 1 ? 'unit' : 'units'} · {order.tierLabel}
          </p>
        </div>
        <StatusPill status={order.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px] [&>*]:min-w-0">
        {/* Items + shipment */}
        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card">
            <header className="border-b border-border px-5 py-3.5">
              <h2 className="text-sm font-medium">Items</h2>
            </header>
            <ul className="divide-y divide-border">
              {order.lines.map((l, i) => (
                <li key={`${l.model}-${l.color}-${i}`} className="flex items-center gap-3 px-5 py-4">
                  <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-muted/50">
                    <img src={l.image} alt={l.model} className="h-full w-full object-contain p-1" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{l.model}</p>
                    <p className="text-xs text-muted-foreground">
                      {l.color} · {l.storage}GB · ×{l.qty}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm font-semibold tabular-nums">{formatUsd(l.unitPriceCents * l.qty)}</p>
                    <p className="font-mono text-xs text-muted-foreground">{formatUsd(l.unitPriceCents)} ea</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-border bg-card">
            <header className="flex items-center justify-between border-b border-border px-5 py-3.5">
              <h2 className="text-sm font-medium">Shipment</h2>
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" strokeWidth={2} />
                Reserved at source
              </span>
            </header>
            <div className="px-5 py-5">
              <Timeline order={order} />
            </div>
          </section>
        </div>

        {/* Totals + actions */}
        <aside className="lg:sticky lg:top-28 lg:self-start">
          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-sm font-medium">Summary</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <Row label="Retail subtotal" value={formatUsd(retailCents)} muted strike={order.savingsCents > 0} />
              {order.savingsCents > 0 && (
                <Row label={`Tier savings · ${order.tierLabel}`} value={`−${formatUsd(order.savingsCents)}`} accent />
              )}
              <Row label="Shipping" value="Free" muted />
              <Row label="Tax" value={formatUsd(0)} muted />
              <div className="flex items-center justify-between border-t border-border pt-3">
                <span className="font-medium">Total</span>
                <span className="font-mono text-lg font-semibold tabular-nums">{formatUsd(order.subtotalCents)}</span>
              </div>
            </dl>

            <Button className="mt-5 w-full" onClick={reorder}>
              <RotateCcw className="h-4 w-4" strokeWidth={2} />
              Reorder at current pricing
            </Button>
            <Link
              to="/contact"
              className={cn(buttonVariants({ variant: 'outline', size: 'md' }), 'mt-2 w-full')}
            >
              Need help with this order?
            </Link>
          </div>
        </aside>
      </div>
    </motion.div>
  );
}

function Row({ label, value, muted = false, accent = false, strike = false }: { label: string; value: string; muted?: boolean; accent?: boolean; strike?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className={muted ? 'text-muted-foreground' : ''}>{label}</dt>
      <dd className={cn('font-mono tabular-nums', accent && 'font-medium text-success', strike && 'text-muted-foreground line-through')}>{value}</dd>
    </div>
  );
}
