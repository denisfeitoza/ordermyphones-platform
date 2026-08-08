import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Inbox } from 'lucide-react';
import { listProfiles, listAccessRequests, setAccessRequestStatus, setCustomerTier, type ProfileRow } from '@/data/adminConfig';
import { DB_TIERS, DB_TIER_LABELS, type DbTier } from '@/lib/invites';
import { useAuth } from '@/store';
import { InvitePanel } from '@/components/admin/InvitePanel';
import { ConfirmPassword } from '@/components/admin/ConfirmPassword';
import { AdminHeading, Panel, Table, Td } from '@/components/admin/parts';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n';

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** Pending "request access" submissions from the public form. The admin copies
 * the email into the invite panel below, sends the tier-scoped invite, then
 * marks the request invited (or dismisses spam). */
function AccessRequestsPanel() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['access-requests'], queryFn: listAccessRequests });
  const act = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'invited' | 'dismissed' }) => setAccessRequestStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['access-requests'] }),
  });
  const rows = q.data ?? [];
  if (rows.length === 0) return null;

  return (
    <Panel title={`${t('Access requests')} (${rows.length} ${t('pending')})`} action={<Inbox className="h-4 w-4 text-muted-foreground" />}>
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {r.full_name}
                {r.business_name && <span className="text-muted-foreground"> · {r.business_name}</span>}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                <span className="font-mono">{r.email}</span>
                {r.phone && <> · {r.phone}</>}
                {r.tier_interest && <> · {t('wants')} {r.tier_interest}</>} · {fmtDate(r.created_at)}
              </p>
              {r.note && <p className="mt-0.5 max-w-md text-xs text-muted-foreground/80">“{r.note}”</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate({ id: r.id, status: 'invited' })}>
                {t('Mark invited')}
              </Button>
              <Button size="sm" variant="ghost" disabled={act.isPending} onClick={() => act.mutate({ id: r.id, status: 'dismissed' })}>
                {t('Dismiss')}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">{t('Copy the email into “Invite a customer” below, pick the tier, send the invite, then mark it invited.')}</p>
    </Panel>
  );
}

/**
 * Real-mode Customers (go-live). Lists the actual registered accounts from
 * public.profiles (RLS admin/staff) instead of the mock's invented businesses,
 * plus the real invite panel. Tier/role changes live in Settings → Users (the
 * sensitive, re-auth-gated surface) — this is the read + invite view.
 */
export function RealCustomers() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const q = useQuery({ queryKey: ['config-profiles'], queryFn: listProfiles });
  const customers = (q.data ?? []).filter((p) => p.role === 'customer');

  // Inline tier change is a sensitive action → confirm with password (same gate
  // as Settings → Users), then apply. Only admins may change a tier server-side.
  const [pending, setPending] = useState<{ user: ProfileRow; tier: DbTier } | null>(null);
  const setTier = useMutation({
    mutationFn: ({ userId, tier }: { userId: string; tier: DbTier }) => setCustomerTier(userId, tier, 'admin console'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config-profiles'] });
      setPending(null);
    },
  });

  return (
    <div className="space-y-6">
      <AdminHeading
        title="Customers"
        subtitle={`${customers.length} ${t('registered accounts')}${isAdmin ? ` · ${t('change a tier inline')}` : ` · ${t('manage tiers & roles in the Users & roles tab')}`}`}
      />

      <AccessRequestsPanel />

      <InvitePanel />

      {q.isLoading ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">{t('Loading customers…')}</div>
      ) : customers.length > 0 ? (
        <Table
          minWidth={720}
          columns={[
            { key: 'name', label: t('Account') },
            { key: 'tier', label: t('Tier') },
            { key: 'joined', label: t('Joined') },
            { key: 'manage', label: '', align: 'right' },
          ]}
        >
          {customers.map((c) => (
            <tr key={c.id} className="transition-colors hover:bg-muted/40">
              <Td>
                <span className="flex items-center gap-2 font-medium">
                  {c.display_name ?? c.email}
                  {c.is_test && <span className="rounded-full bg-muted px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">{t('test')}</span>}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{c.email}</span>
              </Td>
              <Td>
                {isAdmin ? (
                  <div className="relative inline-block">
                    <select
                      value={c.tier ?? ''}
                      disabled={setTier.isPending}
                      onChange={(e) => setPending({ user: c, tier: e.target.value as DbTier })}
                      aria-label={`${t('Tier for')} ${c.email}`}
                      className="h-8 cursor-pointer appearance-none rounded-full border border-border bg-background py-0 pl-3 pr-7 text-xs font-medium capitalize outline-none transition-colors hover:bg-muted focus:border-brand disabled:opacity-50"
                    >
                      {!c.tier && <option value="" disabled>{t('No tier')}</option>}
                      {DB_TIERS.map((t) => (
                        <option key={t} value={t}>{DB_TIER_LABELS[t]}</option>
                      ))}
                    </select>
                    <svg className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium capitalize">
                    {c.tier ? DB_TIER_LABELS[c.tier] : t('No tier')}
                  </span>
                )}
              </Td>
              <Td className="text-muted-foreground">{fmtDate(c.created_at)}</Td>
              <Td align="right">
                <Link to="/admin/config/users" className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
                  {t('Manage')} <ArrowUpRight className="h-3 w-3" strokeWidth={2} />
                </Link>
              </Td>
            </tr>
          ))}
        </Table>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          {t('No customers registered yet. Send an invite above — the buyer signs up with the tier you choose already attached.')}
        </div>
      )}

      {setTier.error && (
        <p className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {(setTier.error as Error).message}
        </p>
      )}

      <ConfirmPassword
        open={!!pending}
        title={pending ? `${t('Change')} ${pending.user.display_name ?? pending.user.email} ${t('to')} ${DB_TIER_LABELS[pending.tier]}?` : ''}
        description={t('This changes the tier — and the prices — the customer sees, effective immediately. Confirm your password to proceed.')}
        actionLabel={t('Change tier')}
        busy={setTier.isPending}
        onCancel={() => setPending(null)}
        onConfirmed={() => pending && setTier.mutate({ userId: pending.user.id, tier: pending.tier })}
      />
    </div>
  );
}
