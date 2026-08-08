import { ArrowRight, Check, Pencil, ShoppingBag, XCircle } from 'lucide-react';
import type { OrderChange, OrderEvent } from '@/data/orderEvents';
import { formatUsd, formatInt } from '@/lib/format';
import { useI18n } from '@/i18n';

type Status = 'pending' | 'approved' | 'partially_approved' | 'rejected' | 'cancelled';

/** Renders one field-level change as a plain, customer-safe sentence. Never
 * exposes cost/supplier/grade — only model, quantity and the price paid. */
function ChangeLine({ c }: { c: OrderChange }) {
  const { t } = useI18n();
  switch (c.type) {
    case 'qty':
      return (
        <span>
          <b className="font-medium text-foreground">{c.label}</b> · {t('qty')}{' '}
          <span className="font-mono tabular-nums">{formatInt(c.from ?? 0)}</span>
          <ArrowRight className="mx-1 inline h-3 w-3 align-middle" strokeWidth={2.5} />
          <span className="font-mono tabular-nums">{formatInt(c.to ?? 0)}</span>
        </span>
      );
    case 'price':
      return (
        <span>
          <b className="font-medium text-foreground">{c.label}</b> · {t('unit price')}{' '}
          <span className="font-mono tabular-nums">{formatUsd(c.from ?? 0)}</span>
          <ArrowRight className="mx-1 inline h-3 w-3 align-middle" strokeWidth={2.5} />
          <span className="font-mono tabular-nums">{formatUsd(c.to ?? 0)}</span>
        </span>
      );
    case 'added':
      return (
        <span>
          <span className="text-emerald-600 dark:text-emerald-400">{t('Added')}</span>{' '}
          <b className="font-medium text-foreground">{c.label}</b> ·{' '}
          <span className="font-mono tabular-nums">×{formatInt(c.qty ?? 0)}</span>{' '}
          @ <span className="font-mono tabular-nums">{formatUsd(c.price ?? 0)}</span>
        </span>
      );
    case 'removed':
      return (
        <span>
          <span className="text-rose-600 dark:text-rose-400">{t('Removed')}</span>{' '}
          <b className="font-medium text-foreground">{c.label}</b> ·{' '}
          <span className="font-mono tabular-nums">×{formatInt(c.qty ?? 0)}</span>
        </span>
      );
    case 'address':
      return <span>{t('Shipping address updated')}</span>;
    case 'note':
      return <span>{t('Order note updated')}</span>;
    default:
      return null;
  }
}

function Dot({ tone, icon: Icon }: { tone: string; icon: typeof Check }) {
  return (
    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${tone}`}>
      <Icon className="h-3.5 w-3.5" strokeWidth={2.5} />
    </span>
  );
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

interface Row {
  key: string;
  at: string;
  dot: React.ReactNode;
  title: string;
  reason?: string | null;
  changes?: OrderChange[];
}

/** Shared order history: placed → edit(s) → decision. The edit rows come from
 * order_events (identical for admin and customer via RLS); placed and decided
 * are derived from the order's own columns. */
export function OrderTimeline({
  placedAt,
  status,
  decidedAt,
  decisionReason,
  events,
}: {
  placedAt: string;
  status: Status;
  decidedAt?: string | null;
  decisionReason?: string | null;
  events: OrderEvent[];
}) {
  const { t } = useI18n();

  const rows: Row[] = [];
  rows.push({
    key: 'placed',
    at: placedAt,
    dot: <Dot tone="bg-foreground text-background" icon={ShoppingBag} />,
    title: t('Order placed'),
  });
  for (const e of events) {
    rows.push({
      key: e.id,
      at: e.createdAt,
      dot: <Dot tone="bg-brand text-white" icon={Pencil} />,
      title: t('Order edited'),
      reason: e.summary,
      changes: e.changes,
    });
  }
  if (decidedAt && status !== 'pending') {
    const rejected = status === 'rejected' || status === 'cancelled';
    rows.push({
      key: 'decided',
      at: decidedAt,
      dot: rejected ? (
        <Dot tone="bg-rose-500 text-white" icon={XCircle} />
      ) : (
        <Dot tone="bg-emerald-500 text-white" icon={Check} />
      ),
      title:
        status === 'approved'
          ? t('Approved')
          : status === 'partially_approved'
            ? t('Partially approved')
            : status === 'rejected'
              ? t('Rejected')
              : t('Cancelled'),
      reason: rejected ? (decisionReason ?? null) : null,
    });
  }

  return (
    <ol className="relative">
      {rows.map((r, i) => (
        <li key={r.key} className="flex gap-3.5 pb-5 last:pb-0">
          <div className="flex flex-col items-center">
            {r.dot}
            {i < rows.length - 1 && <span className="mt-1 w-px flex-1 bg-border" />}
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p className="text-sm font-medium">{r.title}</p>
              <p className="font-mono text-xs text-muted-foreground">{fmt(r.at)}</p>
            </div>
            {r.reason && <p className="mt-0.5 text-xs italic text-muted-foreground">“{r.reason}”</p>}
            {r.changes && r.changes.length > 0 && (
              <ul className="mt-1.5 space-y-1 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                {r.changes.map((c, j) => (
                  <li key={j} className="leading-relaxed">
                    <ChangeLine c={c} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
