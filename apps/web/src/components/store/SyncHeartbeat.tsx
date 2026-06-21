import { useSync } from '@/store';
import { cn } from '@/lib/utils';
import { formatInt } from '@/lib/format';

export function PulseDot({
  status = 'online',
  className,
}: {
  status?: 'online' | 'degraded';
  className?: string;
}) {
  const color = status === 'online' ? 'bg-success' : 'bg-warning';
  return (
    <span className={cn('relative inline-flex h-2 w-2 shrink-0', className)}>
      <span className={cn('absolute inset-0 rounded-full', color, 'animate-ring-pulse')} aria-hidden />
      <span className={cn('relative inline-flex h-2 w-2 rounded-full', color)} />
    </span>
  );
}

/** The inventory bot heartbeat — "re-syncs every 2s", cross-checking suppliers vs orders. */
export function SyncHeartbeat({
  variant = 'compact',
  className,
}: {
  variant?: 'compact' | 'full';
  className?: string;
}) {
  const { secondsAgo, pulse, suppliers, ordersReconciled, skusTracked } = useSync();
  const last = secondsAgo === 0 ? 'just now' : `${secondsAgo}s ago`;

  if (variant === 'compact') {
    return (
      <div className={cn('inline-flex items-center gap-2 text-xs', className)}>
        <PulseDot />
        <span className="text-muted-foreground">
          Live inventory · synced <span className="font-mono text-foreground">{last}</span>
        </span>
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-x-5 whitespace-nowrap text-xs', className)}>
      <span className="inline-flex items-center gap-2">
        <PulseDot />
        <span className="font-medium">Inventory bot</span>
        <span className="text-muted-foreground">re-syncs every 2s · last {last}</span>
      </span>
      <span className="hidden h-3 w-px bg-border sm:block" />
      {suppliers.map((s) => (
        <span key={s.code} className="inline-flex items-center gap-1.5">
          <PulseDot status={s.status} />
          <span className="text-muted-foreground">{s.name}</span>
          <span className="font-mono tabular-nums text-foreground/70">{s.latencyMs}ms</span>
        </span>
      ))}
      <span className="hidden h-3 w-px bg-border sm:block" />
      <span className="text-muted-foreground">
        <span key={pulse} className="inline-block animate-count-bump font-mono tabular-nums text-foreground">
          {formatInt(ordersReconciled)}
        </span>{' '}
        orders reconciled · <span className="font-mono tabular-nums text-foreground">{formatInt(skusTracked)}</span> SKUs tracked
      </span>
    </div>
  );
}
