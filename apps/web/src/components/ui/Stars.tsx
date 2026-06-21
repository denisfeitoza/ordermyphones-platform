import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatInt } from '@/lib/format';

export function Stars({
  rating,
  reviews,
  className,
}: {
  rating: number;
  reviews?: number;
  className?: string;
}) {
  return (
    <div className={cn('inline-flex items-center gap-1.5', className)}>
      <span className="inline-flex items-center gap-1 text-amber-500">
        <Star className="h-3.5 w-3.5 fill-current" strokeWidth={0} />
        <span className="font-mono text-xs font-semibold text-foreground">{rating.toFixed(1)}</span>
      </span>
      {reviews !== undefined && (
        <span className="text-xs text-muted-foreground">({formatInt(reviews)})</span>
      )}
    </div>
  );
}
