import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronRight, MapPin, ShieldCheck, Truck, RotateCcw, Smartphone } from 'lucide-react';
import { buildDisplayName, carrierLabel, type PricedRealListing } from '@/data/realCatalog';
import { resolveProductImage } from '@/lib/productImage';
import { Badge } from '@/components/ui/Badge';
import { RealPriceTag } from './RealPriceTag';
import { RealProductGrid } from './RealProductGrid';
import { PulseDot } from './SyncHeartbeat';
import { formatInt } from '@/lib/format';
import { useI18n } from '@/i18n';

function gradeTone(grade: PricedRealListing['ctiaGrade']): 'success' | 'dark' | 'neutral' {
  if (grade === 'NEW') return 'success';
  if (grade === 'CPO' || grade === 'A') return 'dark';
  return 'neutral';
}

export function RealProductDetail({ item, related }: { item: PricedRealListing; related: PricedRealListing[] }) {
  const { t } = useI18n();
  const image = resolveProductImage(item.model);
  const name = buildDisplayName(item);
  const available = item.totalQty;
  const soldOut = available === 0;

  return (
    <div className="container py-6 md:py-10">
      <nav className="mb-6 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link to="/catalog" className="hover:text-foreground">{t('Catalog')}</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">{name}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-b from-muted/50 to-muted/20">
            <div className="absolute left-4 top-4 z-10 flex flex-col gap-1.5">
              <Badge tone={gradeTone(item.ctiaGrade)}>{t(item.ctiaLabel)}</Badge>
            </div>
            {image ? (
              <motion.img
                key={item.sku}
                src={image}
                alt={name}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="aspect-square w-full object-contain p-8"
              />
            ) : (
              <div className="grid aspect-square w-full place-items-center">
                <Smartphone className="h-24 w-24 text-muted-foreground/40" strokeWidth={1} />
              </div>
            )}
          </div>
        </div>

        <div>
          <span className="text-sm font-medium text-muted-foreground">{item.make}</span>
          <h1 className="mt-1.5 font-display text-3xl font-semibold tracking-tight md:text-4xl">{name}</h1>
          {item.color && <p className="mt-1 text-sm text-muted-foreground">{item.color}</p>}

          <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <RealPriceTag priceCents={item.priceCents} size="lg" />
            <span className="text-sm text-muted-foreground">/ {t('unit')}</span>
          </div>

          <dl className="mt-6 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-xl bg-muted/50 p-3">
              <dt className="text-xs text-muted-foreground">{t('SKU')}</dt>
              <dd className="mt-0.5 font-mono text-xs">{item.sku}</dd>
            </div>
            <div className="rounded-xl bg-muted/50 p-3">
              <dt className="text-xs text-muted-foreground">{t('Carrier')}</dt>
              <dd className="mt-0.5">{carrierLabel(item.carrier)}</dd>
            </div>
            <div className="rounded-xl bg-muted/50 p-3">
              <dt className="text-xs text-muted-foreground">{t('Condition')}</dt>
              <dd className="mt-0.5">{t(item.ctiaLabel)}</dd>
            </div>
          </dl>

          <div className="mt-6 rounded-2xl border border-border p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">{t('Availability')}</h2>
              <span className="font-mono text-xs text-muted-foreground">{formatInt(available)} {t('in stock')}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <PulseDot status={soldOut ? 'degraded' : 'online'} />
              <span className="text-muted-foreground">
                {soldOut ? t('Out of stock — restock in progress') : t('Live stock confirmed, per location')}
              </span>
            </div>
            {!soldOut && (
              <ul className="mt-3 space-y-1.5 border-t border-border pt-3">
                {item.locations.map((loc) => (
                  <li key={loc.name} className="flex items-center justify-between text-sm">
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" strokeWidth={2} />
                      {loc.name}
                    </span>
                    <span className="font-mono font-medium tabular-nums">{formatInt(loc.qty)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3 text-xs">
            {[
              { icon: ShieldCheck, label: '12-month warranty' },
              { icon: Truck, label: 'Ships from US stock' },
              { icon: RotateCcw, label: '30-day returns' },
            ].map((tr) => (
              <div key={tr.label} className="flex flex-col items-center gap-1.5 rounded-xl bg-muted/50 p-3 text-center text-muted-foreground">
                <tr.icon className="h-4 w-4" strokeWidth={1.75} />
                {t(tr.label)}
              </div>
            ))}
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-16 md:mt-24">
          <div className="mb-6 flex items-end justify-between">
            <h2 className="font-display text-xl font-semibold tracking-tight md:text-2xl">{t('More')} {item.model}</h2>
          </div>
          <RealProductGrid items={related} />
        </section>
      )}
    </div>
  );
}
