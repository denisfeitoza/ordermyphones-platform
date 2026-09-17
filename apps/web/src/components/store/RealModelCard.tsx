import { Link } from 'react-router-dom';
import { MapPin, Smartphone } from 'lucide-react';
import type { ModelGroup } from '@/lib/modelGroups';
import { resolveProductImage } from '@/lib/productImage';
import { Badge } from '@/components/ui/Badge';
import { formatInt } from '@/lib/format';
import { PulseDot } from './SyncHeartbeat';
import { RealPriceTag } from './RealPriceTag';
import { useI18n } from '@/i18n';

/** Storage range for the card subtitle: "128GB" or "128GB – 1TB". */
function capacityRange(capacities: string[]): string | null {
  const real = capacities.filter((c) => c && !/^1\s*GB$/i.test(c.trim()));
  if (real.length === 0) return null;
  return real.length === 1 ? real[0] : `${real[0]} – ${real[real.length - 1]}`;
}

/** One card per model (see lib/modelGroups.ts). `search` carries the catalog's
 * single-valued filters to the model page so it opens preselected. */
export function RealModelCard({ group, search = '' }: { group: ModelGroup; search?: string | undefined }) {
  const { t } = useI18n();
  const href = `/m/${group.slug}${search}`;
  const image = group.imageUrl ?? resolveProductImage(group.model);
  const soldOut = group.totalQty === 0;
  const storage = capacityRange(group.capacities);
  const conditions = group.conditions.length;

  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all duration-300 ease-spring hover:-translate-y-1 hover:border-border/70 hover:shadow-card-hover">
      <Link to={href} className="relative block aspect-[4/3] overflow-hidden bg-muted/30">
        <div className="absolute left-3 top-3 z-10 flex flex-col items-start gap-1.5">
          <Badge tone="glass">{group.make}</Badge>
        </div>
        <span className="absolute right-3 top-3 z-10 rounded-full bg-background/80 px-2 py-0.5 font-mono text-[0.7rem] font-medium text-muted-foreground backdrop-blur">
          {formatInt(group.offers.length)} {group.offers.length === 1 ? t('option') : t('options')}
        </span>
        {image ? (
          <img
            src={image}
            alt={group.model}
            loading="lazy"
            className="h-full w-full object-contain p-5 transition-transform duration-500 ease-spring group-hover:scale-[1.06]"
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-gradient-to-b from-muted/60 to-muted/20">
            <Smartphone className="h-14 w-14 text-muted-foreground/50" strokeWidth={1.25} />
          </div>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="min-w-0">
          <Link to={href}>
            <h3 className="truncate font-medium tracking-tight hover:text-brand">{group.model}</h3>
          </Link>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {[storage, `${conditions} ${conditions === 1 ? t('condition') : t('conditions')}`].filter(Boolean).join(' · ')}
          </p>
        </div>

        <div className="space-y-1.5 text-xs">
          <div className="flex items-center gap-1.5">
            <PulseDot status={soldOut ? 'degraded' : 'online'} />
            {soldOut ? (
              <span className="text-muted-foreground">{t('Restocking soon')}</span>
            ) : (
              <span className="text-muted-foreground">
                <span className="font-mono font-semibold tabular-nums text-foreground">{formatInt(group.totalQty)}</span> {t('in stock')}
              </span>
            )}
          </div>
          {group.locations.length > 0 && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              <span className="truncate">{group.locations.join(' · ')}</span>
            </div>
          )}
        </div>

        <div className="mt-auto space-y-2 pt-1">
          <div className="flex items-baseline gap-1.5">
            {group.fromPriceCents !== null && <span className="text-xs text-muted-foreground">{t('From')}</span>}
            <RealPriceTag priceCents={group.fromPriceCents} />
          </div>
          <Link
            to={href}
            className="block w-full rounded-xl bg-primary py-2 text-center text-sm font-medium text-primary-foreground shadow-soft transition-colors hover:bg-primary/90"
          >
            {t('Choose options')}
          </Link>
        </div>
      </div>
    </div>
  );
}
