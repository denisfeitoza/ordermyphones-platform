import type { ReactNode } from 'react';
import { PulseDot } from '@/components/store/SyncHeartbeat';
import { STATUS_META } from '@/components/portal/OrderCard';
import type { OrderStatus } from '@/store';
import type { AdminCustomer } from '@/data/admin';
import { cn } from '@/lib/utils';

export function AdminHeading({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  accent,
  live = false,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  live?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{label}</p>
        {live && <PulseDot />}
      </div>
      <p className={cn('mt-1.5 font-mono text-2xl font-semibold tabular-nums', accent)}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export interface Column {
  key: string;
  label: string;
  align?: 'right';
  className?: string;
}

export function Table({ columns, children, minWidth = 680 }: { columns: Column[]; children: ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full text-sm" style={{ minWidth }}>
        <thead>
          <tr className="border-b border-border text-left">
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn('px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground', c.align === 'right' && 'text-right', c.className)}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, align, className }: { children: ReactNode; align?: 'right'; className?: string }) {
  return <td className={cn('px-4 py-3 align-middle', align === 'right' && 'text-right', className)}>{children}</td>;
}

export function OrderStatusChip({ status }: { status: OrderStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', m.soft)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', m.dot)} />
      {status === 'reserved' ? 'Reserved' : m.label}
    </span>
  );
}

const CUSTOMER_TONE: Record<AdminCustomer['status'], string> = {
  active: 'bg-success/10 text-success',
  new: 'bg-brand/10 text-brand',
  'at-risk': 'bg-warning/10 text-warning',
};

export function CustomerStatusChip({ status }: { status: AdminCustomer['status'] }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium capitalize', CUSTOMER_TONE[status])}>
      {status === 'at-risk' ? 'At risk' : status}
    </span>
  );
}
