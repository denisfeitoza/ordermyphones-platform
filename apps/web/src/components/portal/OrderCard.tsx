import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronRight, PackageCheck } from 'lucide-react';
import type { AccountOrder, OrderStatus } from '@/store';
import { formatUsd } from '@/lib/format';
import { cn } from '@/lib/utils';

const MotionLink = motion(Link);

export const STATUS_META: Record<
  OrderStatus,
  { label: string; step: number; dot: string; soft: string }
> = {
  reserved: { label: 'Reserved at source', step: 0, dot: 'bg-warning', soft: 'bg-warning/10 text-warning' },
  processing: { label: 'Processing', step: 1, dot: 'bg-brand', soft: 'bg-brand/10 text-brand' },
  shipped: { label: 'Shipped', step: 2, dot: 'bg-brand-2', soft: 'bg-brand-2/10 text-brand-2' },
  delivered: { label: 'Delivered', step: 3, dot: 'bg-success', soft: 'bg-success/10 text-success' },
};

const STEPS: { key: OrderStatus; label: string }[] = [
  { key: 'reserved', label: 'Reserved' },
  { key: 'processing', label: 'Processing' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'delivered', label: 'Delivered' },
];

export function StatusPill({ status }: { status: OrderStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', m.soft)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', m.dot)} />
      {m.label}
    </span>
  );
}

export function OrderProgress({ status }: { status: OrderStatus }) {
  const cur = STATUS_META[status].step;
  return (
    <div className="flex items-center">
      {STEPS.map((s, i) => {
        const reached = i <= cur;
        return (
          <Fragment key={s.key}>
            <div className="flex shrink-0 flex-col items-center gap-1.5">
              <span
                className={cn(
                  'grid h-2.5 w-2.5 place-items-center rounded-full',
                  reached ? STATUS_META[status].dot : 'bg-border',
                )}
              />
              <span
                className={cn(
                  'text-[0.65rem]',
                  i === cur ? 'font-medium text-foreground' : reached ? 'text-muted-foreground' : 'text-muted-foreground/50',
                )}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <span className={cn('mb-4 h-px flex-1', i < cur ? 'bg-foreground/30' : 'bg-border')} />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

function Thumbs({ lines }: { lines: AccountOrder['lines'] }) {
  const shown = lines.slice(0, 3);
  const extra = lines.length - shown.length;
  return (
    <div className="flex items-center">
      {shown.map((l, i) => (
        <div
          key={`${l.model}-${l.color}-${i}`}
          className={cn(
            'grid h-11 w-11 place-items-center rounded-xl border border-border bg-muted/50',
            i > 0 && '-ml-3',
          )}
          style={{ zIndex: shown.length - i }}
        >
          <img src={l.image} alt={l.model} className="h-full w-full object-contain p-1" />
        </div>
      ))}
      {extra > 0 && (
        <span className="-ml-3 grid h-11 w-11 place-items-center rounded-xl border border-border bg-muted font-mono text-xs text-muted-foreground">
          +{extra}
        </span>
      )}
    </div>
  );
}

export function OrderCard({ order, index = 0 }: { order: AccountOrder; index?: number }) {
  const lineLabel =
    order.lines.length === 1
      ? order.lines[0].model
      : `${order.lines[0].model} + ${order.lines.length - 1} more`;

  return (
    <MotionLink
      to={`/portal/orders/${order.id}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
      className="group block rounded-2xl border border-border bg-card p-4 transition-colors hover:border-foreground/20 sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1 font-mono text-sm font-semibold">
            {order.id}
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" strokeWidth={2} />
          </p>
          <p className="text-xs text-muted-foreground">
            {/* Parse as local midnight (append time) — a bare 'YYYY-MM-DD' is UTC and drifts a day in negative offsets. */}
            {new Date(`${order.placedAt}T00:00:00`).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
        </div>
        <StatusPill status={order.status} />
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Thumbs lines={order.lines} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{lineLabel}</p>
          <p className="font-mono text-xs text-muted-foreground">
            {order.units} {order.units === 1 ? 'unit' : 'units'} · {order.tierLabel}
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-base font-semibold tabular-nums">{formatUsd(order.subtotalCents)}</p>
          {order.savingsCents > 0 && (
            <p className="font-mono text-xs text-success">−{formatUsd(order.savingsCents)}</p>
          )}
        </div>
      </div>

      <div className="mt-5">
        <OrderProgress status={order.status} />
      </div>

      <div className="mt-4 flex items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
        <PackageCheck className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
        <span className="truncate">Held at {order.suppliers.join(' · ')}</span>
      </div>
    </MotionLink>
  );
}
