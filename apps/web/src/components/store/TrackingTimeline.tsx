import { useState } from 'react';
import { AlertTriangle, CheckCircle2, MapPin, PackageCheck, RefreshCw, Truck, Undo2 } from 'lucide-react';
import { isShippingDisabled, useOrderTracking, useRefreshTracking, type TrackingStatus } from '@/data/shipping';
import { Button } from '@/components/ui/Button';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useI18n } from '@/i18n';

const STATUS_LABEL: Record<TrackingStatus, string> = {
  queued: 'Label created',
  in_transit: 'In transit',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  exception: 'Delivery exception',
  returned: 'Returned to sender',
  unknown: 'Awaiting first scan',
};

const STATUS_ICON: Record<TrackingStatus, typeof Truck> = {
  queued: PackageCheck,
  in_transit: Truck,
  out_for_delivery: Truck,
  delivered: CheckCircle2,
  exception: AlertTriangle,
  returned: Undo2,
  unknown: PackageCheck,
};

const STATUS_TONE: Record<TrackingStatus, string> = {
  queued: 'text-muted-foreground',
  in_transit: 'text-sky-700 dark:text-sky-300',
  out_for_delivery: 'text-sky-700 dark:text-sky-300',
  delivered: 'text-emerald-700 dark:text-emerald-300',
  exception: 'text-amber-700 dark:text-amber-300',
  returned: 'text-amber-700 dark:text-amber-300',
  unknown: 'text-muted-foreground',
};

const EVENT_PAGE = 5;

/**
 * Live carrier status for one order, read from `shipment_tracking` and
 * refreshable on demand (FedEx only for now — other carriers keep the manual
 * tracking number the staff typed). Renders nothing at all while FedEx is not
 * configured and nothing has ever been polled, so the portal looks exactly
 * like it does today until the keys are in place.
 */
export function TrackingTimeline({
  orderId,
  carrier,
  trackingNumber,
  className,
}: {
  orderId: string;
  carrier: string | null;
  trackingNumber: string | null;
  className?: string;
}) {
  const { t, lang } = useI18n();
  const [showAll, setShowAll] = useState(false);
  const isFedex = /fedex/i.test(carrier ?? '');
  const { data: tracking } = useOrderTracking(orderId, Boolean(trackingNumber));
  const refresh = useRefreshTracking(orderId);

  if (!trackingNumber || !isFedex) return null;
  // Integration off and nothing ever polled: render nothing (today's portal).
  const disabled = isShippingDisabled(refresh.error);
  if (!tracking && disabled) return null;

  const status: TrackingStatus = tracking?.status ?? 'unknown';
  const Icon = STATUS_ICON[status];
  const events = tracking?.events ?? [];
  const shown = showAll ? events : events.slice(0, EVENT_PAGE);

  return (
    <section className={cn('rounded-2xl border border-border', className)}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <Icon className={cn('h-4 w-4', STATUS_TONE[status])} strokeWidth={2} />
          {t(STATUS_LABEL[status])}
          {tracking?.statusDetail && status === 'exception' && (
            <span className="text-xs font-normal text-muted-foreground">· {tracking.statusDetail}</span>
          )}
        </h2>
        <Button size="sm" variant="outline" disabled={refresh.isPending} onClick={() => refresh.mutate()}>
          <RefreshCw className={cn('h-3.5 w-3.5', refresh.isPending && 'animate-spin')} strokeWidth={2} />
          {refresh.isPending ? t('Checking…') : t('Refresh tracking')}
        </Button>
      </header>

      <div className="space-y-3 px-5 py-4 text-sm">
        <p className="text-xs text-muted-foreground">
          {carrier} · <span className="font-mono">{trackingNumber}</span>
          {tracking?.estimatedAt && status !== 'delivered' && (
            <> · {t('Estimated')} {formatDate(tracking.estimatedAt, lang)}</>
          )}
          {tracking?.deliveredAt && <> · {t('Delivered')} {formatDate(tracking.deliveredAt, lang)}</>}
        </p>

        {events.length > 0 ? (
          <ol className="space-y-2.5 border-l border-border pl-4">
            {shown.map((e, i) => (
              <li key={`${e.at}-${i}`} className="relative">
                <span className={cn('absolute -left-[21px] top-1.5 h-2 w-2 rounded-full', i === 0 ? 'bg-brand' : 'bg-border')} />
                <p className="font-medium">{e.description ?? t(STATUS_LABEL[e.status])}</p>
                <p className="text-xs text-muted-foreground">
                  {e.at ? formatDate(e.at, lang, 'long') : '—'}
                  {e.location && (
                    <span className="ml-2 inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" strokeWidth={2} />
                      {e.location}
                    </span>
                  )}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-muted-foreground">
            {refresh.isError && !disabled
              ? t('The carrier could not be reached. Try again in a moment.')
              : t('No carrier scan yet. Refresh to check with FedEx.')}
          </p>
        )}

        {events.length > EVENT_PAGE && (
          <button type="button" onClick={() => setShowAll((v) => !v)} className="text-xs font-medium text-brand hover:underline">
            {showAll ? t('Show less') : `${t('Show all')} (${events.length})`}
          </button>
        )}

        {(tracking?.polledAt || tracking?.pollError) && (
          <p className="border-t border-border pt-3 text-xs text-muted-foreground">
            {tracking.polledAt && <>{t('Last checked')} {formatDate(tracking.polledAt, lang, 'long')}</>}
            {tracking.pollError && <span className="ml-2 text-amber-700 dark:text-amber-300">· {tracking.pollError}</span>}
          </p>
        )}
      </div>
    </section>
  );
}
