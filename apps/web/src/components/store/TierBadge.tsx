import type { TierDef } from '@/data/tiers';
import { tierBg, tierSoft } from '@/lib/tierStyles';
import { cn } from '@/lib/utils';

export function TierBadge({
  tier,
  showRange = false,
  className,
}: {
  tier: TierDef;
  showRange?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        tierSoft[tier.tone],
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', tierBg[tier.tone])} />
      {tier.label}
      {showRange && <span className="font-mono opacity-70">· {tier.rangeLabel}</span>}
    </span>
  );
}
