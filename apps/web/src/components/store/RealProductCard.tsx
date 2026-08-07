import { Link } from 'react-router-dom';
import { Smartphone } from 'lucide-react';
import { buildDisplayName, type PricedRealListing } from '@/data/realCatalog';
import { resolveProductImage } from '@/lib/productImage';
import { Badge } from '@/components/ui/Badge';
import { formatInt } from '@/lib/format';
import { PulseDot } from './SyncHeartbeat';
import { RealPriceTag } from './RealPriceTag';
import { RealAddToCart } from './RealAddToCart';
import { useI18n } from '@/i18n';

export function gradeTone(grade: PricedRealListing['ctiaGrade']): 'success' | 'dark' | 'neutral' {
  if (grade === 'NEW') return 'success';
  if (grade === 'CPO' || grade === 'A') return 'dark';
  return 'neutral';
}

/** Real-mode product card — one card per SKU (a grade/carrier/color/capacity
 * combination is a distinct sellable unit; PRODUCT-CATALOG-STANDARD.md §1),
 * not per model, unlike the mock's one-card-per-model-with-swatches shape.
 * Phase 6 wired real checkout: <RealAddToCart> pushes {variant_id, qty} into
 * the dedicated real cart (store/realCart.tsx) and renders only for a signed-in
 * customer with a visible tier price — everyone else still gets View details. */
export function RealProductCard({ item }: { item: PricedRealListing }) {
  const { t } = useI18n();
  const image = resolveProductImage(item.model);
  const name = buildDisplayName(item);
  const soldOut = item.totalQty === 0;

  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all duration-300 ease-spring hover:-translate-y-1 hover:border-border/70 hover:shadow-card-hover">
      <Link to={`/p/${item.sku}`} className="relative block aspect-[4/3] overflow-hidden bg-muted/30">
        <div className="absolute left-3 top-3 z-10 flex flex-col items-start gap-1.5">
          <Badge tone={gradeTone(item.ctiaGrade)}>{t(item.ctiaLabel)}</Badge>
          <Badge tone="glass">{item.make}</Badge>
        </div>
        {image ? (
          <img
            src={image}
            alt={name}
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
          <Link to={`/p/${item.sku}`}>
            <h3 className="truncate font-medium tracking-tight hover:text-brand">{name}</h3>
          </Link>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {item.color ? `${item.color} · ` : ''}
            <span className="font-mono">{item.sku}</span>
          </p>
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          <PulseDot status={soldOut ? 'degraded' : 'online'} />
          {soldOut ? (
            <span className="text-muted-foreground">{t('Restocking soon')}</span>
          ) : (
            <span className="text-muted-foreground">
              <span className="font-mono font-semibold tabular-nums text-foreground">{formatInt(item.totalQty)}</span>{' '}
              {t('in stock')}
            </span>
          )}
        </div>

        <div className="mt-auto space-y-2 pt-1">
          <RealPriceTag priceCents={item.priceCents} />
          {!soldOut && <RealAddToCart variantId={item.variantId} priceCents={item.priceCents} />}
          <Link
            to={`/p/${item.sku}`}
            className="block w-full rounded-xl border border-border py-2 text-center text-sm font-medium transition-colors hover:bg-muted"
          >
            {t('View details')}
          </Link>
        </div>
      </div>
    </div>
  );
}
