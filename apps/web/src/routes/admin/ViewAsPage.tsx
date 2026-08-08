import { useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Eye, Loader2 } from 'lucide-react';
import { adminGetCustomerProfile, adminGetCustomerOrders, logViewAs, type ViewAsOrder } from '@/data/adminConfig';
import { DB_TIER_LABELS } from '@/lib/invites';
import { Panel } from '@/components/admin/parts';
import { useI18n } from '@/i18n';
import { formatUsd } from '@/lib/format';
import { cn } from '@/lib/utils';

const STATUS_TONE: Record<string, string> = {
  approved: 'bg-success/15 text-success',
  partially_approved: 'bg-warning/15 text-warning',
  pending: 'bg-brand/15 text-brand',
  rejected: 'bg-destructive/15 text-destructive',
  cancelled: 'bg-muted text-muted-foreground',
};

function OrderCard({ order }: { order: ViewAsOrder }) {
  const { t } = useI18n();
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-mono text-xs text-muted-foreground">#{order.id.slice(0, 8)}</span>
          <span className="ml-2 text-xs text-muted-foreground">{new Date(order.placed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        </div>
        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize', STATUS_TONE[order.status] ?? 'bg-muted text-muted-foreground')}>
          {order.status.replace('_', ' ')}
        </span>
      </div>
      <div className="mt-3 space-y-1.5">
        {order.items.map((it, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <span className="min-w-0 truncate">
              {it.make} {it.model}
              <span className="text-muted-foreground"> · {it.capacity}{it.color ? ` · ${it.color}` : ''}</span>
            </span>
            <span className="ml-3 shrink-0 font-mono tabular-nums text-muted-foreground">
              {it.qty_approved ?? it.qty_requested} × {formatUsd(it.unit_price_cents)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-between border-t border-border pt-2 text-sm">
        <span className="text-muted-foreground">{t('Ordered total')}</span>
        <span className="font-mono font-semibold tabular-nums">{formatUsd(order.subtotal_cents)}</span>
      </div>
    </div>
  );
}

export default function ViewAsPage() {
  const { t } = useI18n();
  const { userId } = useParams<{ userId: string }>();
  const loggedRef = useRef<string | null>(null);

  const profileQ = useQuery({ queryKey: ['view-as-profile', userId], queryFn: () => adminGetCustomerProfile(userId!), enabled: !!userId });
  const ordersQ = useQuery({
    queryKey: ['view-as-orders', userId],
    queryFn: () => adminGetCustomerOrders(userId!),
    enabled: !!userId && profileQ.data?.role === 'customer',
  });

  // Log the view-as ONCE per userId (not on refetch). Ref-guarded so React 18
  // StrictMode's double-mount in dev doesn't write two audit rows.
  useEffect(() => {
    if (!userId || loggedRef.current === userId) return;
    loggedRef.current = userId;
    void logViewAs(userId).catch(() => undefined);
  }, [userId]);

  const profile = profileQ.data;

  return (
    <div className="min-h-dvh bg-muted/20">
      {/* Persistent read-only banner */}
      <div className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 border-b border-warning/30 bg-warning/10 px-4 py-2.5 text-sm">
        <span className="inline-flex items-center gap-2 font-medium text-warning">
          <Eye className="h-4 w-4" strokeWidth={2} />
          {profile ? `${t('Viewing as')} ${profile.email} ${t('(read-only)')}` : t('Read-only lens')}
        </span>
        <Link to="/admin/config/users" className="inline-flex items-center gap-1.5 rounded-full border border-warning/40 px-3 py-1 text-xs font-medium text-warning transition-colors hover:bg-warning/15">
          <ArrowLeft className="h-3.5 w-3.5" /> {t('Back to accounts')}
        </Link>
      </div>

      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        {profileQ.isLoading && (
          <div className="grid place-items-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-brand" />
          </div>
        )}
        {profileQ.isError && <p className="text-sm text-destructive">{profileQ.error instanceof Error ? profileQ.error.message : t('Could not load this account.')}</p>}
        {profileQ.isSuccess && !profile && <p className="text-sm text-muted-foreground">{t('Account not found.')}</p>}

        {profile && (
          <>
            <Panel title={t('Account')}>
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">{t('Name')}</dt>
                  <dd className="text-sm font-medium">{profile.display_name || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t('Email')}</dt>
                  <dd className="text-sm">{profile.email}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t('Role')}</dt>
                  <dd className="text-sm capitalize">{profile.role}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t('Tier')}</dt>
                  <dd className="text-sm">{profile.tier ? DB_TIER_LABELS[profile.tier] : '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t('Phone')}</dt>
                  <dd className="text-sm">{profile.phone || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t('Member since')}</dt>
                  <dd className="text-sm">{new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</dd>
                </div>
              </dl>
              <p className="mt-4 text-xs text-muted-foreground">
                {t("Addresses are stored client-side in this build and aren't available to the lens (see AUTONOMOUS-DECISIONS.md).")}
              </p>
            </Panel>

            {profile.role === 'customer' ? (
              <div className="space-y-4">
                <h2 className="text-sm font-medium">{t('Orders')}</h2>
                {ordersQ.isLoading && <p className="text-sm text-muted-foreground">{t('Loading orders…')}</p>}
                {ordersQ.data && ordersQ.data.length === 0 && (
                  <Panel>
                    <p className="py-6 text-center text-sm text-muted-foreground">{t('No orders yet.')}</p>
                  </Panel>
                )}
                {ordersQ.data?.map((o) => <OrderCard key={o.id} order={o} />)}
              </div>
            ) : (
              <Panel title={t('Staff view')}>
                <p className="text-sm text-muted-foreground">
                  {t('This is a staff account. Staff operate the admin console (import stock, approve orders, manage catalog) but cannot access config or finance. Use the Users tab and the audit log to review what they can touch — a full staff console lens is a follow-up.')}
                </p>
              </Panel>
            )}
          </>
        )}
      </div>
    </div>
  );
}
