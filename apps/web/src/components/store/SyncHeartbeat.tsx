import { cn } from '@/lib/utils';

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
