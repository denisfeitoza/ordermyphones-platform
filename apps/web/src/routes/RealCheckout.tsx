import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Check, MapPin, PackageCheck, Plus, ShoppingBag } from 'lucide-react';
import { useAuth, useRealCart } from '@/store';
import { supabase } from '@/lib/supabase';
import { expandCartToOrderItems } from '@/lib/orderItems';
import { listAddresses, createAddress, type AddressRow } from '@/data/addresses';
import { useRealCatalog, buildDisplayName, type PricedRealListing } from '@/data/realCatalog';
import { Button } from '@/components/ui/Button';
import { formatUsd } from '@/lib/format';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

type Phase = 'review' | 'placing' | 'done';

/** Sentinel selection meaning "type a fresh address" instead of a saved one. */
const NEW = '__new__';

interface ShippingForm {
  street: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
}

/** Human message for the errors place_order raises server-side. Anything else
 * degrades to a generic retry — a raw Postgres string is never shown. */
function placeOrderError(t: (s: string) => string, message: string | undefined): string {
  const m = message ?? '';
  if (m.includes('no_price')) return t('One or more items are no longer priced for your tier. Remove them and try again.');
  if (m.includes('no_tier')) return t('Your account has no pricing tier yet. Contact us to finish setup.');
  if (m.includes('empty_order')) return t('Your cart is empty.');
  if (m.includes('customer_only')) return t('Only customer accounts can place orders.');
  return t('We could not place your order. Please try again.');
}

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const { t } = useI18n();
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{t(label)}</span>
      <input
        {...props}
        className="h-11 rounded-xl border border-border bg-background px-3.5 text-sm outline-none transition-colors focus:border-brand"
      />
    </label>
  );
}

/**
 * Real-mode checkout. Reads the {variant_id, qty} real cart, resolves display
 * + tier price from the cached catalog, and calls the SECURITY DEFINER
 * `place_order` RPC — the server captures prices from the caller's tier (a
 * client price is never sent). No payment step, no shipping integration (D4/D8):
 * the address is captured here / prefilled from the profile and stored on the
 * order. The order holds NO stock; our team approves and deducts later (D5).
 */
export function RealCheckout() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { lines, clear } = useRealCart();
  const { items } = useRealCatalog(true);

  const [phase, setPhase] = useState<Phase>('review');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<ShippingForm>({ street: '', city: '', state: '', zip: '', phone: '' });
  // Which saved address is chosen, or NEW to type one. null until the book loads.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saveNew, setSaveNew] = useState(true);

  // The saved address book (#06). Default first — we pre-select it so a returning
  // buyer never re-types ("não perguntar de novo").
  const { data: addresses = [], isLoading: addressesLoading } = useQuery({ queryKey: ['addresses'], queryFn: listAddresses, enabled: !!user });

  // Once the book resolves, pre-select the default (or the first). With an empty
  // book, fall back to the typed-address form.
  useEffect(() => {
    if (addressesLoading || selectedId !== null) return;
    setSelectedId(addresses.length ? (addresses.find((a) => a.is_default)?.id ?? addresses[0].id) : NEW);
  }, [addressesLoading, addresses, selectedId]);

  // Prefill the "new address" form from the profile (Phase 5 G1). Best-effort;
  // RLS scopes to self. Only matters when the buyer types a fresh address.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void supabase
      .from('profiles')
      .select('shipping_address, phone')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        const a = (data.shipping_address ?? {}) as Partial<ShippingForm>;
        setForm((f) => ({
          street: a.street ?? f.street,
          city: a.city ?? f.city,
          state: a.state ?? f.state,
          zip: a.zip ?? f.zip,
          phone: data.phone ?? f.phone,
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const usingNew = selectedId === NEW || selectedId === null;
  const selectedAddress: AddressRow | undefined = usingNew ? undefined : addresses.find((a) => a.id === selectedId);

  const byVariant = useMemo(() => new Map(items.map((i) => [i.variantId, i])), [items]);
  const resolved = useMemo(
    () =>
      lines.map((l) => {
        const item: PricedRealListing | undefined = byVariant.get(l.variantId);
        const price = item?.priceCents ?? null;
        return { ...l, item, price, lineTotalCents: price === null ? null : price * l.qty };
      }),
    [lines, byVariant],
  );
  const subtotalCents = resolved.reduce((s, l) => s + (l.lineTotalCents ?? 0), 0);
  const unitCount = lines.reduce((s, l) => s + l.qty, 0);

  if (lines.length === 0 && phase !== 'done') {
    return (
      <div className="container flex flex-col items-center justify-center gap-4 py-24 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-muted">
          <ShoppingBag className="h-7 w-7 text-muted-foreground" strokeWidth={1.5} />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold">{t('Nothing to check out')}</h1>
          <p className="mt-1 text-muted-foreground">{t('Add a few phones and the right tier price is applied automatically.')}</p>
        </div>
        <Button onClick={() => navigate('/catalog')}>{t('Browse catalog')}</Button>
      </div>
    );
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    // Resolve the ship-to from the chosen saved address or the typed form. The
    // order snapshot stays {street,city,state,zip} — place_order and the admin
    // order view are unchanged (advisor point 5).
    const src = selectedAddress ?? form;
    const shipping_address = { street: src.street.trim(), city: src.city.trim(), state: src.state.trim(), zip: src.zip.trim() };
    const phone = (selectedAddress?.phone ?? form.phone ?? '').trim();
    if (!shipping_address.street || !shipping_address.city || !shipping_address.state || !shipping_address.zip) {
      setError(t('Please choose or enter a complete shipping address.'));
      return;
    }
    setPhase('placing');

    // Mirror into profiles.shipping_address + phone so the profile-completeness
    // meter stays honest (advisor point 1). Best-effort, non-blocking.
    if (user) void supabase.from('profiles').update({ shipping_address, phone }).eq('id', user.id);

    // Save a freshly-typed address to the book for next time, if the buyer opted in.
    if (user && usingNew && saveNew) {
      void createAddress(user.id, { recipient: profile?.display_name ?? null, ...shipping_address, phone: phone || null }).catch(() => {
        /* non-fatal: the order still goes through */
      });
    }

    const p_items = expandCartToOrderItems(lines);
    const { data, error: rpcError } = await supabase.rpc('place_order', {
      p_items,
      p_shipping_address: shipping_address,
      p_note: null,
    });

    if (rpcError) {
      setError(placeOrderError(t, rpcError.message));
      setPhase('review');
      return;
    }

    const placed = data as { id?: string } | null;
    setOrderId(placed?.id ?? null);
    clear();
    setPhase('done');
  }

  return (
    <div className="container py-8 md:py-12">
      <h1 className="mb-6 font-display text-2xl font-semibold tracking-tight md:text-3xl">
        {phase === 'done' ? t('Order placed') : t('Checkout')}
      </h1>

      <div className="grid gap-8 lg:grid-cols-[1fr_380px] lg:gap-12 [&>*]:min-w-0">
        <div>
          {phase !== 'done' ? (
            <form onSubmit={submit} className="space-y-6">
              <section className="space-y-4 rounded-2xl border border-border p-5">
                <h2 className="font-medium">{t('Shipping address')}</h2>

                {/* Saved-address picker (#06): default pre-selected so a returning
                    buyer just confirms. "Use a new address" reveals the form. */}
                {addresses.length > 0 && (
                  <div className="grid gap-2">
                    {addresses.map((a) => {
                      const active = selectedId === a.id;
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => setSelectedId(a.id)}
                          className={cn(
                            'flex items-start gap-3 rounded-xl border p-3.5 text-left transition-colors',
                            active ? 'border-brand bg-brand/5' : 'border-border hover:bg-muted/50',
                          )}
                        >
                          <span className={cn('mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2', active ? 'border-brand' : 'border-border')}>
                            {active && <span className="h-2.5 w-2.5 rounded-full bg-brand" />}
                          </span>
                          <span className="min-w-0">
                            <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                              {a.label || a.recipient || t('Saved address')}
                              {a.is_default && <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">{t('Default')}</span>}
                            </span>
                            <span className="block text-sm text-muted-foreground">
                              {a.street}, {a.city}, {a.state} {a.zip}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setSelectedId(NEW)}
                      className={cn(
                        'flex items-center gap-3 rounded-xl border border-dashed p-3.5 text-left text-sm font-medium transition-colors',
                        usingNew ? 'border-brand bg-brand/5 text-foreground' : 'border-border text-muted-foreground hover:bg-muted/50',
                      )}
                    >
                      <span className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-full border-2', usingNew ? 'border-brand' : 'border-border')}>
                        {usingNew ? <Plus className="h-3 w-3 text-brand" strokeWidth={3} /> : <MapPin className="h-3 w-3" strokeWidth={2} />}
                      </span>
                      {t('Use a new address')}
                    </button>
                  </div>
                )}

                {usingNew && (
                  <div className="space-y-4">
                    <Field
                      label="Street address"
                      required
                      autoComplete="street-address"
                      value={form.street}
                      onChange={(e) => setForm((f) => ({ ...f, street: e.target.value }))}
                    />
                    <div className="grid gap-4 sm:grid-cols-3">
                      <Field label="City" required value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
                      <Field label="State" required value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} />
                      <Field label="ZIP" required inputMode="numeric" value={form.zip} onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))} />
                    </div>
                    <Field
                      label="Phone number"
                      type="tel"
                      autoComplete="tel"
                      value={form.phone}
                      onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    />
                    {user && (
                      <label className="flex items-center gap-2 text-sm text-muted-foreground">
                        <input type="checkbox" checked={saveNew} onChange={(e) => setSaveNew(e.target.checked)} className="h-4 w-4 rounded border-border accent-brand" />
                        {t('Save this address for next time')}
                      </label>
                    )}
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                {t('Nothing is charged here. Once you place the order, our team reaches out to align payment and shipping, and confirms stock before anything is charged.')}
              </section>

              {error && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>
              )}

              <Button type="submit" size="lg" className="w-full" disabled={phase === 'placing'}>
                {phase === 'placing' ? t('Placing your order…') : t('Place order')}
              </Button>
            </form>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-2xl border border-border p-6"
            >
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-success text-white">
                  <Check className="h-6 w-6" strokeWidth={3} />
                </span>
                <div>
                  <p className="font-display text-lg font-semibold">{t('Order received')}</p>
                  {orderId && <p className="font-mono text-sm text-muted-foreground">{orderId.slice(0, 8).toUpperCase()}</p>}
                </div>
              </div>

              <div className="mt-5 space-y-2 rounded-xl bg-muted/50 p-4 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  <PackageCheck className="h-4 w-4 text-success" strokeWidth={2} />
                  {unitCount} {unitCount === 1 ? t('unit') : t('units')} {t('pending approval')}
                </div>
                <p className="text-muted-foreground">
                  {t('Our team reviews stock and reaches out to align payment and shipping. Track its status any time in your portal.')}
                </p>
              </div>

              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                <Button className="flex-1" onClick={() => navigate('/catalog')}>
                  {t('Continue shopping')}
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => navigate('/portal/orders')}>
                  {t('Track order')}
                </Button>
              </div>
            </motion.div>
          )}
        </div>

        {/* Summary */}
        <aside className="lg:sticky lg:top-28 lg:self-start">
          <div className="rounded-2xl border border-border p-5">
            <h2 className="mb-3 font-medium">{t('Order summary')}</h2>
            {resolved.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('Your order is being confirmed.')}</p>
            ) : (
              <ul className="divide-y divide-border">
                {resolved.map((l) => (
                  <li key={l.variantId} className="flex items-center justify-between gap-2 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{l.item ? buildDisplayName(l.item) : t('Item')}</p>
                      <p className="text-xs text-muted-foreground">×{l.qty}</p>
                    </div>
                    <span className="font-mono text-sm font-medium tabular-nums">
                      {l.lineTotalCents === null ? '—' : formatUsd(l.lineTotalCents)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3 space-y-2 border-t border-border pt-4 text-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>{t('Shipping')}</span>
                <span>{t('Arranged separately')}</span>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-3">
                <span className="font-medium">{t('Subtotal')}</span>
                <span className="font-mono text-xl font-semibold tabular-nums">{formatUsd(subtotalCents)}</span>
              </div>
            </div>
          </div>
          <Link to="/catalog" className="mt-3 block text-center text-sm text-muted-foreground hover:text-foreground">
            {t('Back to catalog')}
          </Link>
        </aside>
      </div>
    </div>
  );
}
