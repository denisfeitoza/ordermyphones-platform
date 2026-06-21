import { totalAvailable, type CatalogItem } from '@/data/catalog';
import { useSync } from '@/store';
import { formatInt } from '@/lib/format';
import { cn } from '@/lib/utils';
import { PulseDot } from './SyncHeartbeat';

export function StockBadge({ item, className }: { item: CatalogItem; className?: string }) {
  const total = totalAvailable(item);
  const { pulse } = useSync();
  const low = total > 0 && total <= 12;

  if (total === 0) {
    return (
      <span className={cn('inline-flex items-center gap-1.5 text-xs text-muted-foreground', className)}>
        <PulseDot status="degraded" />
        Restocking soon
      </span>
    );
  }

  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs', className)}>
      <PulseDot />
      {/* key={pulse} replays the bump each 2s sync — reads as a live count */}
      <span key={pulse} className="inline-block animate-count-bump font-mono font-semibold tabular-nums">
        {formatInt(total)}
      </span>
      <span className={cn(low ? 'font-medium text-warning' : 'text-muted-foreground')}>
        {low ? 'left · low stock' : 'in stock'}
      </span>
    </span>
  );
}
