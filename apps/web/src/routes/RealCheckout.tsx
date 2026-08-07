import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, PackageCheck, ShoppingBag } from 'lucide-react';
import { useAuth, useRealCart } from '@/store';
import { supabase } from '@/lib/supabase';
import { expandCartToOrderItems } from '@/lib/orderItems';
import { useRealCatalog, buildDisplayName, type PricedRealListing } from '@/data/realCatalog';
import { Button } from '@/components/ui/Button';
import { formatUsd } from '@/lib/format';
import { useI18n } from '@/i18n';

type Phase = 'review' | 'placing' | 'done';

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
  const { user } = useAuth();
  const { lines, clear } = useRealCart();
  const { items } = useRealCatalog(true);

  const [phase, setPhase] = useState<Phase>('review');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<ShippingForm>({ street: '', city: '', state: '', zip: '', phone: '' });

  // Prefill shipping from the profile (Phase 5 G1). Best-effort; RLS scopes to self.
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
    setPhase('placing');

    const shipping_address = { street: form.street.trim(), city: form.city.trim(), state: form.state.trim(), zip: form.zip.trim() };
    // Persist address + phone to the profile for next time (best-effort, non-blocking).
    if (user) void supabase.from('profiles').update({ shipping_address, phone: form.phone.trim() }).eq('id', user.id);

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
              </section>

              <section className="rounded-2xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                {t('Nothing is charged here. Our team confirms live stock and approves your order — you can track its status in your portal.')}
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
                  {t('Our team reviews stock and approves your order. Track its status any time in your portal.')}
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
