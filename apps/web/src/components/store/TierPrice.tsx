import { unitPriceCents, type CatalogItem } from '@/data/catalog';
import type { TierDef } from '@/data/tiers';
import { tierText } from '@/lib/tierStyles';
import { formatUsd } from '@/lib/format';
import { cn } from '@/lib/utils';

export function TierPrice({
  item,
  tier,
  size = 'md',
  className,
}: {
  item: CatalogItem;
  tier: TierDef;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const price = unitPriceCents(item, tier.code);
  const retail = unitPriceCents(item, 'tier_1');
  const save = retail - price;
  const priceCls = size === 'lg' ? 'text-3xl' : size === 'sm' ? 'text-base' : 'text-xl';

  return (
    <div className={cn('space-y-0.5', className)}>
      <div className="flex items-baseline gap-2">
        <span className={cn('font-mono font-semibold tracking-tight tabular-nums', priceCls)}>
          {formatUsd(price)}
        </span>
        {save > 0 && (
          <span className="font-mono text-xs text-muted-foreground line-through">{formatUsd(retail)}</span>
        )}
      </div>
      {save > 0 ? (
        <span className={cn('text-xs font-medium', tierText[tier.tone])}>
          Save {formatUsd(save)} per unit · {tier.label}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">Retail · buy more to unlock tier pricing</span>
      )}
    </div>
  );
}
