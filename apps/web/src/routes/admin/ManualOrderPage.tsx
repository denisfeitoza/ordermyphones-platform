import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Check, FileText, Search, Trash2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { AdminHeading } from '@/components/admin/parts';
import { Button } from '@/components/ui/Button';
import { QtyInput, clampQty } from '@/components/store/QtyInput';
import { fetchCatalogListing, buildDisplayName, type RealListing } from '@/data/realCatalog';
import { usePlaceOrderFor, type ShippingAddress } from '@/data/adminOrders';
import { DB_TIER_LABELS, type DbTier } from '@/lib/invites';
import { exportDocCsv } from '@/lib/export';
import { adminErrorMessage } from '@/lib/adminErrors';
import { formatInt, formatUsd, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useI18n } from '@/i18n';

/**
 * Manual order: staff build an order on a customer's behalf (phone/WhatsApp
 * orders, quotes). Prices shown are the customer's tier prices; the server
 * (place_order_for) prices the order again from the customer's tier, so the
 * client never sends a price. The order then goes through the same approval
 * and reconciliation as an online order.
 */

interface CustomerRow {
  id: string;
  email: string;
  display_name: string | null;
  tier: DbTier | null;
  is_test: boolean;
  phone: string | null;
  shipping_address: ShippingAddress | null;
}

interface Line {
  variantId: string;
  qty: number;
}

const REQUIREMENT_LABEL: Record<string, string> = {
  tax_certificate: 'Tax certificate',
  business_name: 'Business name',
  shipping_address: 'Shipping address',
};

const EMPTY_ADDRESS = { street: '', city: '', state: '', zip: '' };

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

async function fetchCustomers(): Promise<CustomerRow[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, display_name, tier, is_test, phone, shipping_address')
    .eq('role', 'customer')
    .order('display_name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CustomerRow[];
}

async function fetchTierPrices(tier: DbTier): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('prices')
      .select('variant_id, price_cents')
      .eq('tier', tier)
      .eq('visible', true)
      .order('variant_id')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const r of data ?? []) out.set(r.variant_id as string, r.price_cents as number);
    if (!data || data.length < PAGE) break;
  }
  return out;
}

const inputCls = 'h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm outline-none transition-colors focus:border-brand';

export default function ManualOrderPage() {
  const { t } = useI18n();
  const customersQ = useQuery({ queryKey: ['manual-order-customers'], queryFn: fetchCustomers });
  const listingQ = useQuery({ queryKey: ['catalog-listing'], queryFn: fetchCatalogListing, staleTime: 3 * 60_000, gcTime: 15 * 60_000 });

  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [address, setAddress] = useState(EMPTY_ADDRESS);
  const [note, setNote] = useState('');
  const [override, setOverride] = useState(false);
  const [clientRef, setClientRef] = useState(randomId);
  const [placed, setPlaced] = useState<{ id: string; subtotalCents: number } | null>(null);

  const pricesQ = useQuery({
    queryKey: ['manual-order-prices', customer?.tier],
    queryFn: () => fetchTierPrices(customer!.tier!),
    enabled: !!customer?.tier,
    staleTime: 3 * 60_000,
  });
  const place = usePlaceOrderFor();

  const listing = useMemo(() => listingQ.data ?? [], [listingQ.data]);
  const byVariant = useMemo(() => new Map(listing.map((l) => [l.variantId, l])), [listing]);
  const prices = pricesQ.data;

  const customerMatches = useMemo(() => {
    const n = customerSearch.trim().toLowerCase();
    const all = customersQ.data ?? [];
    return (n ? all.filter((c) => `${c.display_name ?? ''} ${c.email}`.toLowerCase().includes(n)) : all).slice(0, 8);
  }, [customerSearch, customersQ.data]);

  const productMatches = useMemo(() => {
    const n = productSearch.trim().toLowerCase();
    if (n.length < 2) return [];
    const words = n.split(/\s+/);
    return listing
      .filter((l) => {
        const hay = `${l.make} ${l.model} ${l.capacity} ${l.color ?? ''} ${l.carrier} ${l.lockStatus} ${l.sku}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      })
      .slice(0, 12);
  }, [productSearch, listing]);

  const resolved = lines.map((l) => {
    const item = byVariant.get(l.variantId);
    const price = prices?.get(l.variantId) ?? null;
    return { ...l, item, price, total: price === null ? null : price * l.qty };
  });
  const unpriced = resolved.filter((l) => l.price === null).length;
  const subtotal = resolved.reduce((s, l) => s + (l.total ?? 0), 0);
  const units = resolved.reduce((s, l) => s + l.qty, 0);
  const missing =
    place.isError && place.error.message.includes('requirements_missing')
      ? String((place.error as Error & { details?: string | null }).details ?? 'requirements')
          .split(',')
          .filter(Boolean)
      : [];

  function chooseCustomer(c: CustomerRow) {
    setCustomer(c);
    setCustomerSearch('');
    setAddress({ ...EMPTY_ADDRESS, ...(c.shipping_address ?? {}) });
    setOverride(false);
    place.reset();
  }

  function addLine(l: RealListing) {
    setLines((prev) => {
      const hit = prev.find((x) => x.variantId === l.variantId);
      if (hit) return prev.map((x) => (x.variantId === l.variantId ? { ...x, qty: clampQty(x.qty + 1) } : x));
      return [...prev, { variantId: l.variantId, qty: 1 }];
    });
  }

  function startOver() {
    setCustomer(null);
    setLines([]);
    setAddress(EMPTY_ADDRESS);
    setNote('');
    setOverride(false);
    setPlaced(null);
    setClientRef(randomId());
    place.reset();
  }

  function exportQuote() {
    if (!customer) return;
    exportDocCsv({
      title: 'Quote',
      reference: `QUOTE-${new Date().toISOString().slice(0, 10)}`,
      business: customer.display_name ?? customer.email,
      tierLabel: customer.tier ? DB_TIER_LABELS[customer.tier] : '—',
      dateLabel: formatDate(new Date().toISOString()),
      lines: resolved.map((l) => ({
        model: l.item ? `${l.item.make} ${l.item.model}` : l.variantId,
        variant: l.item ? buildDisplayName(l.item) : '',
        qty: l.qty,
        unitPriceCents: l.price ?? 0,
        lineTotalCents: l.total ?? 0,
      })),
      subtotalCents: subtotal,
      savingsCents: 0,
      isTest: customer.is_test,
    });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!customer || lines.length === 0 || unpriced > 0 || place.isPending) return;
    const a = { street: address.street.trim(), city: address.city.trim(), state: address.state.trim(), zip: address.zip.trim() };
    place.mutate(
      {
        customerId: customer.id,
        items: lines.map((l) => ({ variant_id: l.variantId, qty: l.qty })),
        shippingAddress: a.street || a.city || a.state || a.zip ? a : null,
        note: note.trim() || null,
        clientRef,
        overrideRequirements: override,
      },
      { onSuccess: (o) => setPlaced({ id: o.id, subtotalCents: o.subtotal_cents }) },
    );
  }

  if (placed && customer) {
    return (
      <div className="space-y-6">
        <AdminHeading title="Manual order" subtitle="Place an order for a customer, and export it as a spreadsheet." />
        <div className="max-w-xl rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-success text-white">
              <Check className="h-5 w-5" strokeWidth={3} />
            </span>
            <div className="min-w-0">
              <p className="font-medium">{t('Order placed for')} {customer.display_name ?? customer.email}</p>
              <p className="font-mono text-sm text-muted-foreground">
                {placed.id.slice(0, 8).toUpperCase()} · {formatUsd(placed.subtotalCents)}
              </p>
            </div>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">{t('It is pending approval, like any online order. The customer sees it in their portal.')}</p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Link to="/admin/orders" className="flex-1">
              <Button className="w-full">{t('Go to orders')}</Button>
            </Link>
            <Button variant="outline" className="flex-1" onClick={startOver}>
              {t('New manual order')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <AdminHeading title="Manual order" subtitle="Place an order for a customer, and export it as a spreadsheet." />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px] [&>*]:min-w-0">
        <div className="space-y-6">
          {/* 1 · Customer */}
          <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
            <h2 className="text-sm font-medium">1 · {t('Customer')}</h2>
            {customer ? (
              <div className="flex items-start justify-between gap-3 rounded-xl border border-brand bg-brand/5 p-3.5">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {customer.display_name ?? customer.email}
                    {customer.is_test && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[0.65rem] font-bold uppercase text-amber-900 dark:bg-amber-500/15 dark:text-amber-300">TEST</span>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {customer.email} · {customer.tier ? t(DB_TIER_LABELS[customer.tier]) : t('No tier')}
                  </p>
                </div>
                <button type="button" onClick={() => setCustomer(null)} aria-label={t('Change customer')} className="-m-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted">
                  <X className="h-4 w-4" strokeWidth={2} />
                </button>
              </div>
            ) : (
              <>
                <label className="relative block">
                  <span className="sr-only">{t('Search customers')}</span>
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={2} />
                  <input value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} placeholder={t('Name or email')} className={cn(inputCls, 'pl-10')} />
                </label>
                {customersQ.isLoading && <p className="text-sm text-muted-foreground">{t('Loading…')}</p>}
                {customersQ.isError && <p className="text-sm text-destructive">{t('Could not load customers.')}</p>}
                <div className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
                  {customerMatches.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => chooseCustomer(c)}
                      disabled={!c.tier}
                      className="flex min-h-11 w-full min-w-0 items-center justify-between gap-3 rounded-xl border border-border px-3.5 py-2 text-left text-sm hover:bg-muted/50 disabled:opacity-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{c.display_name ?? c.email}</span>
                        <span className="block truncate text-xs text-muted-foreground">{c.email}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{c.tier ? t(DB_TIER_LABELS[c.tier]) : t('No tier')}</span>
                    </button>
                  ))}
                  {customersQ.isSuccess && customerMatches.length === 0 && <p className="text-sm text-muted-foreground">{t('No customer matches.')}</p>}
                </div>
              </>
            )}
          </section>

          {/* 2 · Items */}
          <section className={cn('space-y-3 rounded-2xl border border-border bg-card p-5', !customer && 'pointer-events-none opacity-50')} aria-disabled={!customer}>
            <h2 className="text-sm font-medium">2 · {t('Items')}</h2>
            <label className="relative block">
              <span className="sr-only">{t('Search models')}</span>
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={2} />
              <input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder={t('Model, capacity, color or SKU')} className={cn(inputCls, 'pl-10')} disabled={!customer} />
            </label>
            {productMatches.length > 0 && (
              <div className="grid max-h-72 grid-cols-[minmax(0,1fr)] gap-1.5 overflow-y-auto">
                {productMatches.map((l) => {
                  const price = prices?.get(l.variantId) ?? null;
                  return (
                    <button
                      key={l.variantId}
                      type="button"
                      onClick={() => addLine(l)}
                      disabled={price === null}
                      className="flex min-h-11 w-full min-w-0 items-center justify-between gap-3 rounded-xl border border-border px-3.5 py-2 text-left text-sm hover:bg-muted/50 disabled:opacity-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{buildDisplayName(l)}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {l.ctiaLabel}
                          {l.color ? ` · ${l.color}` : ''} · {formatInt(l.totalQty)} {t('in stock')} · <span className="font-mono">{l.sku}</span>
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-sm tabular-nums">{price === null ? t('No price') : formatUsd(price)}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {resolved.length > 0 && (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {resolved.map((l) => (
                  <li key={l.variantId} className="flex flex-wrap items-center gap-3 px-3.5 py-2.5">
                    <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                      <p className="truncate text-sm font-medium">{l.item ? buildDisplayName(l.item) : t('Unavailable item')}</p>
                      {l.item && <p className="truncate font-mono text-xs text-muted-foreground">{l.item.sku}</p>}
                      <p className={cn('text-xs', l.price === null ? 'text-destructive' : 'text-muted-foreground')}>
                        {l.price === null ? t('No price for this tier') : `${formatUsd(l.price)} ${t('each')}`}
                        {l.item && l.qty > l.item.totalQty ? ` · ${t('more than in stock')} (${formatInt(l.item.totalQty)})` : ''}
                      </p>
                    </div>
                    <QtyInput
                      value={l.qty}
                      onChange={(n) => setLines((prev) => prev.map((x) => (x.variantId === l.variantId ? { ...x, qty: clampQty(n) } : x)))}
                      aria-label={t('Quantity')}
                      className="h-11 w-20 rounded-xl border border-border bg-background px-2 text-center font-mono text-sm tabular-nums outline-none focus:border-brand"
                    />
                    <span className="ml-auto w-24 text-right font-mono text-sm tabular-nums">{l.total === null ? '—' : formatUsd(l.total)}</span>
                    <button type="button" onClick={() => setLines((prev) => prev.filter((x) => x.variantId !== l.variantId))} aria-label={t('Remove')} className="grid h-11 w-11 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-destructive">
                      <Trash2 className="h-4 w-4" strokeWidth={2} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 3 · Ship to + note */}
          <section className={cn('space-y-3 rounded-2xl border border-border bg-card p-5', !customer && 'pointer-events-none opacity-50')}>
            <h2 className="text-sm font-medium">3 · {t('Ship to and note')}</h2>
            <input value={address.street} onChange={(e) => setAddress({ ...address, street: e.target.value })} placeholder={t('Street')} className={inputCls} disabled={!customer} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_120px_120px]">
              <input value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} placeholder={t('City')} className={cn(inputCls, 'col-span-2 sm:col-span-1')} disabled={!customer} />
              <input value={address.state} onChange={(e) => setAddress({ ...address, state: e.target.value })} placeholder={t('State')} className={inputCls} disabled={!customer} />
              <input value={address.zip} onChange={(e) => setAddress({ ...address, zip: e.target.value })} placeholder={t('ZIP')} className={inputCls} disabled={!customer} />
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder={t('PO number or note')}
              disabled={!customer}
              className="w-full resize-y rounded-xl border border-border bg-background px-3.5 py-3 text-sm outline-none transition-colors focus:border-brand"
            />
          </section>
        </div>

        {/* Summary */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
            <h2 className="text-sm font-medium">{t('Summary')}</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <dt>{t('Units')}</dt>
                <dd className="font-mono tabular-nums">{formatInt(units)}</dd>
              </div>
              <div className="flex justify-between border-t border-border pt-2">
                <dt className="font-medium">{t('Total')}</dt>
                <dd className="font-mono text-lg font-semibold tabular-nums">{formatUsd(subtotal)}</dd>
              </div>
            </dl>
            <p className="text-xs text-muted-foreground">{t('Priced at the customer’s tier. The server prices the order again when you place it.')}</p>

            {unpriced > 0 && <p className="text-sm text-destructive">{t('Remove the items with no price to continue.')}</p>}

            {missing.length > 0 && (
              <div className="space-y-2 rounded-lg bg-warning/10 px-3 py-2.5 text-sm">
                <p>
                  {t('This account is missing:')} {missing.map((k) => t(REQUIREMENT_LABEL[k] ?? k)).join(', ')}.
                </p>
                <label className="flex items-start gap-2">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand" checked={override} onChange={(e) => setOverride(e.target.checked)} />
                  <span>{t('Place it anyway (recorded in the audit log)')}</span>
                </label>
              </div>
            )}
            {place.isError && missing.length === 0 && <p className="text-sm text-destructive">{adminErrorMessage(t, place.error.message)}</p>}

            <div className="grid gap-2">
              <Button type="submit" variant="brand" size="lg" disabled={!customer || lines.length === 0 || unpriced > 0 || place.isPending || (missing.length > 0 && !override)}>
                {place.isPending ? t('Placing…') : t('Place order for customer')}
              </Button>
              <Button type="button" variant="outline" onClick={exportQuote} disabled={!customer || lines.length === 0}>
                <FileText className="h-4 w-4" strokeWidth={2} aria-hidden />
                {t('Export quote (CSV)')}
              </Button>
            </div>
          </div>
        </aside>
      </div>
    </form>
  );
}
