import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, ChevronRight, MapPin, Minus, Plus, ShieldCheck, ShoppingBag, Smartphone } from 'lucide-react';
import { carrierLabel, type PricedRealListing } from '@/data/realCatalog';
import { HOME_ICONS, useHomeContent } from '@/data/homeContent';
import type { ModelGroup } from '@/lib/modelGroups';
import { sortCapacities } from '@/lib/modelGroups';
import { allocateQty, allocationTotal, rankOffers } from '@/lib/bestOffer';
import { resolveProductImage } from '@/lib/productImage';
import { formatInt, formatUsd } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useAuth, useRealCart } from '@/store';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { RealPriceTag } from './RealPriceTag';
import { canOrder } from './RealAddToCart';
import { gradeTone } from './RealProductCard';
import { PulseDot } from './SyncHeartbeat';
import { useI18n } from '@/i18n';

type Axis = 'capacity' | 'condition' | 'network' | 'color';
type Selection = Record<Axis, string | null>;

const GRADE_ORDER: Record<PricedRealListing['ctiaGrade'], number> = { NEW: 0, CPO: 1, A: 2, B: 3, C: 4, D: 5 };
const OTHER_OFFERS_STEP = 12;

function axisValue(o: PricedRealListing, axis: Axis): string | null {
  switch (axis) {
    case 'capacity':
      return o.capacity && !/^1\s*GB$/i.test(o.capacity.trim()) ? o.capacity : null;
    case 'condition':
      return o.ctiaLabel;
    case 'network':
      return o.lockStatus === 'unlocked' ? 'unlocked' : `locked:${o.carrier}`;
    case 'color':
      return o.color;
  }
}

function matches(o: PricedRealListing, sel: Selection, except: Axis | null): boolean {
  return (Object.keys(sel) as Axis[]).every((axis) => axis === except || sel[axis] === null || axisValue(o, axis) === sel[axis]);
}

/** Catalog filters arrive as ?capacity=&condition=&lock=&carrier= (see RealCatalogView). */
function initialSelection(params: URLSearchParams): Selection {
  const lock = params.get('lock');
  const carrier = params.get('carrier');
  let network: string | null = null;
  if (lock === 'unlocked' || carrier === 'UNL') network = 'unlocked';
  else if (carrier) network = `locked:${carrier}`;
  return { capacity: params.get('capacity'), condition: params.get('condition'), network, color: null };
}

function cheapest(offers: PricedRealListing[]): number | null {
  const pool = offers.some((o) => o.totalQty > 0) ? offers.filter((o) => o.totalQty > 0) : offers;
  let min: number | null = null;
  for (const o of pool) if (o.priceCents !== null && (min === null || o.priceCents < min)) min = o.priceCents;
  return min;
}

function offerSummary(o: PricedRealListing, networkLabel: (v: string) => string): string {
  return [axisValue(o, 'capacity'), o.ctiaLabel, networkLabel(axisValue(o, 'network') ?? ''), o.color].filter(Boolean).join(' · ');
}

/**
 * Model page (/m/:slug): pick storage → condition → network → color, and the
 * page resolves the best value for the chosen quantity across every SKU and
 * warehouse that matches (lib/bestOffer.ts). Unselected axes mean "any", so a
 * buyer who only cares about price gets the cheapest in-stock unit straight away.
 */
export function RealModelDetail({ group }: { group: ModelGroup }) {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const { signedIn, role } = useAuth();
  const { add } = useRealCart();
  const { data: home } = useHomeContent();
  const trust = home?.benefits.enabled ? home.benefits.items.slice(0, 3) : [];

  const [sel, setSel] = useState<Selection>(() => initialSelection(params));
  const [qty, setQty] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const [otherLimit, setOtherLimit] = useState(OTHER_OFFERS_STEP);

  const image = group.imageUrl ?? resolveProductImage(group.model);
  const description = group.offers.find((o) => o.description)?.description ?? null;

  const networkLabel = (v: string) => {
    if (v === 'unlocked') return t('Unlocked');
    const code = v.replace('locked:', '');
    return code === 'OTH' ? t('Locked') : `${carrierLabel(code)} ${t('locked')}`;
  };

  const axes = useMemo(() => {
    const values = (axis: Axis) => [...new Set(group.offers.map((o) => axisValue(o, axis)).filter((v): v is string => !!v))];
    const conditionRank = new Map(group.offers.map((o) => [o.ctiaLabel, GRADE_ORDER[o.ctiaGrade]]));
    return ([
      { axis: 'capacity', label: t('Storage'), values: sortCapacities(values('capacity')) },
      { axis: 'condition', label: t('Condition'), values: values('condition').sort((a, b) => (conditionRank.get(a) ?? 9) - (conditionRank.get(b) ?? 9)) },
      { axis: 'network', label: t('Network'), values: values('network').sort((a, b) => (a === 'unlocked' ? -1 : b === 'unlocked' ? 1 : a.localeCompare(b))) },
      { axis: 'color', label: t('Color'), values: values('color').sort() },
    ] as const).filter((a) => a.values.length > 1 || (a.values.length === 1 && a.axis !== 'color'));
  }, [group.offers, t]);

  const matching = useMemo(() => group.offers.filter((o) => matches(o, sel, null)), [group.offers, sel]);
  const lines = useMemo(() => allocateQty(matching, qty), [matching, qty]);
  const total = allocationTotal(lines);
  const matchingStock = matching.reduce((sum, o) => sum + o.totalQty, 0);
  const others = useMemo(() => rankOffers(matching), [matching]);
  const orderable = lines.length > 0 && lines.every((l) => canOrder(signedIn, role, l.offer.priceCents));
  const selectionActive = Object.values(sel).some((v) => v !== null);

  function toggle(axis: Axis, value: string) {
    setSel((prev) => ({ ...prev, [axis]: prev[axis] === value ? null : value }));
    setOtherLimit(OTHER_OFFERS_STEP);
  }

  function addToCart() {
    for (const l of lines) add(l.offer.variantId, l.qty);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1400);
  }

  return (
    <div className="container py-6 md:py-10">
      <nav className="mb-6 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link to="/catalog" className="hover:text-foreground">{t('Catalog')}</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">{group.model}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-b from-muted/50 to-muted/20">
            {image ? (
              <img src={image} alt={group.model} className="aspect-square w-full object-contain p-8" />
            ) : (
              <div className="grid aspect-square w-full place-items-center">
                <Smartphone className="h-24 w-24 text-muted-foreground/40" strokeWidth={1} />
              </div>
            )}
          </div>
        </div>

        <div>
          <span className="text-sm font-medium text-muted-foreground">{group.make}</span>
          <h1 className="mt-1.5 font-display text-3xl font-semibold tracking-tight md:text-4xl">{group.model}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            <span className="font-mono font-semibold text-foreground">{formatInt(group.totalQty)}</span> {t('in stock')} ·{' '}
            <span className="font-mono">{formatInt(group.offers.length)}</span> {t('options')}
            {group.locations.length > 0 && <> · {group.locations.join(' · ')}</>}
          </p>
          {description && <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{description}</p>}

          <div className="mt-6 space-y-5">
            {axes.map(({ axis, label, values }) => (
              <div key={axis}>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-sm font-semibold">{label}</h2>
                  {sel[axis] !== null && (
                    <button type="button" onClick={() => toggle(axis, sel[axis] as string)} className="text-xs font-medium text-brand hover:underline">
                      {t('Any')}
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {values.map((value) => {
                    const pool = group.offers.filter((o) => axisValue(o, axis) === value && matches(o, sel, axis));
                    const available = pool.length > 0;
                    const from = cheapest(pool);
                    const active = sel[axis] === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        disabled={!available}
                        onClick={() => toggle(axis, value)}
                        aria-pressed={active}
                        className={cn(
                          'flex min-h-11 flex-col items-start justify-center rounded-xl border px-3 py-1.5 text-left transition-colors',
                          active ? 'border-brand bg-brand/5 ring-1 ring-brand' : 'border-border hover:border-foreground/30',
                          !available && 'cursor-not-allowed opacity-40',
                        )}
                      >
                        <span className="text-sm font-medium">{axis === 'network' ? networkLabel(value) : t(value)}</span>
                        {from !== null && <span className="font-mono text-xs text-muted-foreground">{t('from')} {formatUsd(from)}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-border p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">{t('Best offer')}</h2>
              <span className="text-xs text-muted-foreground">
                <span className="font-mono">{formatInt(matchingStock)}</span> {t('in stock')}
                {selectionActive && ` ${t('for this selection')}`}
              </span>
            </div>

            {lines.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('No offers match this selection.')}</p>
            ) : (
              <>
                <ul className="space-y-2">
                  {lines.map((l) => (
                    <li key={l.offer.variantId} className="flex items-start justify-between gap-3 rounded-xl bg-muted/40 p-3 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium">{offerSummary(l.offer, networkLabel)}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" strokeWidth={2} />
                            {l.offer.locations.map((loc) => loc.name).join(' · ') || t('Restocking soon')}
                          </span>
                          <span>
                            <span className="font-mono">{formatInt(l.offer.totalQty)}</span> {t('in stock')}
                          </span>
                          <Link to={`/p/${l.offer.sku}`} className="font-mono hover:text-brand">{l.offer.sku}</Link>
                        </p>
                      </div>
                      {l.offer.priceCents !== null && (
                        <div className="shrink-0 text-right">
                          <RealPriceTag priceCents={l.offer.priceCents} size="sm" />
                          <p className="font-mono text-xs text-muted-foreground">× {formatInt(l.qty)}</p>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
                {lines.length > 1 && (
                  <p className="mt-2 text-xs text-muted-foreground">{t('Split across lots to keep the lowest price for your quantity.')}</p>
                )}
                {qty > matchingStock && (
                  <p className="mt-2 text-xs text-muted-foreground">{t('Quantity above live stock is confirmed at approval.')}</p>
                )}

                {total === null ? (
                  // Signed out / not priced for this tier: one honest call to action, no stepper.
                  <div className="mt-4 border-t border-border pt-4">
                    <RealPriceTag priceCents={null} />
                  </div>
                ) : (
                  <>
                  <div className="mt-4 flex items-baseline justify-between border-t border-border pt-4">
                    <span className="text-sm text-muted-foreground">{t('Total')}</span>
                    <span className="font-mono text-3xl font-semibold tabular-nums">{formatUsd(total)}</span>
                  </div>

                  <div className="mt-4 flex items-center gap-3">
                    <div className="inline-flex items-center rounded-full border border-border">
                      <button type="button" onClick={() => setQty((n) => Math.max(1, n - 1))} className="grid h-11 w-11 place-items-center rounded-l-full hover:bg-muted" aria-label={t('Decrease')}>
                        <Minus className="h-4 w-4" strokeWidth={2} />
                      </button>
                      <input
                        type="number"
                        min={1}
                        value={qty}
                        onChange={(e) => setQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                        className="h-11 w-16 border-x border-border bg-transparent text-center font-mono text-sm tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                        aria-label={t('Quantity')}
                      />
                      <button type="button" onClick={() => setQty((n) => n + 1)} className="grid h-11 w-11 place-items-center rounded-r-full hover:bg-muted" aria-label={t('Increase')}>
                        <Plus className="h-4 w-4" strokeWidth={2} />
                      </button>
                    </div>
                    {orderable && (
                      <Button variant="primary" size="lg" className="flex-1" onClick={addToCart}>
                        {justAdded ? <Check className="h-4 w-4" strokeWidth={2.5} /> : <ShoppingBag className="h-4 w-4" strokeWidth={2} />}
                        {justAdded ? t('Added to cart') : t('Add to cart')}
                      </Button>
                    )}
                  </div>
                  </>
                )}
              </>
            )}
          </div>

          {trust.length > 0 && (
            <div className="mt-6 grid grid-cols-3 gap-3 text-xs">
              {trust.map((tr) => {
                const Icon = HOME_ICONS[tr.icon] ?? ShieldCheck;
                return (
                  <div key={tr.text} className="flex flex-col items-center gap-1.5 rounded-xl bg-muted/50 p-3 text-center text-muted-foreground">
                    <Icon className="h-4 w-4" strokeWidth={1.75} />
                    {t(tr.text)}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {others.length > 0 && (
        <section className="mt-16 md:mt-24">
          <h2 className="mb-4 font-display text-xl font-semibold tracking-tight md:text-2xl">
            {t('All offers')} <span className="font-mono text-base text-muted-foreground">({formatInt(others.length)})</span>
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-sm" style={{ minWidth: 720 }}>
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">{t('Variant')}</th>
                  <th className="px-4 py-2.5 font-medium">{t('Condition')}</th>
                  <th className="px-4 py-2.5 font-medium">{t('Network')}</th>
                  <th className="px-4 py-2.5 font-medium">{t('Location')}</th>
                  <th className="px-4 py-2.5 font-medium">{t('In stock')}</th>
                  <th className="px-4 py-2.5 text-right font-medium">{t('Price')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {others.slice(0, otherLimit).map((o) => (
                  <tr key={o.variantId} className={lines.some((l) => l.offer.variantId === o.variantId) ? 'bg-secondary/40' : ''}>
                    <td className="px-4 py-3">
                      <Link to={`/p/${o.sku}`} className="font-medium hover:text-brand">
                        {[axisValue(o, 'capacity'), o.color].filter(Boolean).join(' · ') || o.sku}
                      </Link>
                    </td>
                    <td className="px-4 py-3"><Badge tone={gradeTone(o.ctiaGrade)}>{t(o.ctiaLabel)}</Badge></td>
                    <td className="px-4 py-3 text-muted-foreground">{networkLabel(axisValue(o, 'network') ?? '')}</td>
                    <td className="px-4 py-3 text-muted-foreground">{o.locations.map((l) => l.name).join(' · ') || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 font-mono tabular-nums text-muted-foreground">
                        <PulseDot status={o.totalQty > 0 ? 'online' : 'degraded'} />
                        {formatInt(o.totalQty)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right"><RealPriceTag priceCents={o.priceCents} size="sm" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {others.length > otherLimit && (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" onClick={() => setOtherLimit((n) => n + OTHER_OFFERS_STEP * 2)}>
                {t('Load more')}
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
