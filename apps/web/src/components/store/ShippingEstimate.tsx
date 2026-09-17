import { Loader2, Truck } from 'lucide-react';
import { isShippingDisabled, useShippingQuote } from '@/data/shipping';
import { formatUsd } from '@/lib/format';
import { useI18n } from '@/i18n';

const MAX_SHOWN = 3;

/**
 * On-demand FedEx estimate at checkout. Deliberately a button, not a reactive
 * quote: every call is a billed FedEx transaction, and the amount is an
 * ESTIMATE — the order total stays tier price × qty (D4/D8), so shipping is
 * still invoiced separately by the team.
 */
export function ShippingEstimate({
  zip,
  state,
  city,
  units,
}: {
  zip: string;
  state: string;
  city: string;
  units: number;
}) {
  const { t } = useI18n();
  const quote = useShippingQuote();
  const ready = zip.trim().length >= 5 && units > 0;

  // FedEx not wired up (or no warehouse address yet): keep today's copy.
  if (isShippingDisabled(quote.error) || quote.error?.message === 'no_origin_configured') {
    return (
      <div className="flex items-center justify-between text-muted-foreground">
        <span>{t('Shipping')}</span>
        <span>{t('Arranged separately')}</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 text-muted-foreground">
        <span>{t('Shipping')}</span>
        {quote.data ? (
          <span className="font-mono text-foreground">{formatUsd(quote.data.options[0].amountCents)}*</span>
        ) : (
          <button
            type="button"
            disabled={!ready || quote.isPending}
            onClick={() => quote.mutate({ destination: { postal_code: zip.trim(), state_code: state.trim(), city: city.trim() }, units })}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
          >
            {quote.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} /> : <Truck className="h-3.5 w-3.5" strokeWidth={2} />}
            {quote.isPending ? t('Checking rates…') : t('Estimate shipping')}
          </button>
        )}
      </div>

      {quote.data && (
        <ul className="space-y-1 rounded-xl bg-muted/40 p-3 text-xs">
          {quote.data.options.slice(0, MAX_SHOWN).map((o) => (
            <li key={`${o.origin.code}-${o.serviceType}`} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-muted-foreground">
                {o.serviceName ?? o.serviceType}
                {o.transitDays ? ` · ${o.transitDays} ${o.transitDays === 1 ? t('day') : t('days')}` : ''}
                {` · ${o.origin.name}`}
              </span>
              <span className="shrink-0 font-mono tabular-nums">{formatUsd(o.amountCents)}</span>
            </li>
          ))}
          <li className="border-t border-border pt-1.5 text-muted-foreground">
            {t('Estimate for')} {quote.data.parcels.count} {quote.data.parcels.count === 1 ? t('parcel') : t('parcels')} ·{' '}
            {t('*not included in the total — shipping is invoiced separately')}
          </li>
        </ul>
      )}

      {quote.isError && !isShippingDisabled(quote.error) && (
        <p className="text-xs text-amber-700 dark:text-amber-300">{t('Could not get a live rate. Our team will confirm shipping.')}</p>
      )}
    </div>
  );
}
