import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowUpRight, AtSign, Inbox, Mail } from 'lucide-react';
import {
  listProfiles,
  listAccessRequests,
  listContactMessages,
  listNewsletterSignups,
  markContactMessageHandled,
  setAccessRequestStatus,
  setCustomerTier,
  type AccessRequestRow,
  type ContactMessageRow,
  type ProfileRow,
} from '@/data/adminConfig';
import { DB_TIERS, DB_TIER_LABELS, inviteFromAccessRequest, type DbTier } from '@/lib/invites';
import { useAuth } from '@/store';
import { CopyLink, InvitePanel } from '@/components/admin/InvitePanel';
import { ConfirmPassword } from '@/components/admin/ConfirmPassword';
import { AdminHeading, Panel, Table, Td } from '@/components/admin/parts';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n';
import { formatDate } from '@/lib/format';
import { useAllAccountTerms } from '@/data/accounts';
import { useTierUpgradeCandidates } from '@/data/tierProgress';
import { TERMS_LABEL } from '@/lib/payment';

/** Pending "request access" submissions from the public form. An admin picks
 * the tier and clicks Invite: invite_from_access_request creates the invite and
 * marks the request invited in one transaction, then the copyable link shows
 * here (e-mail delivery is off until a sender is wired — G-1). Staff can only
 * dismiss spam; inviting is admin-only server-side. */
function AccessRequestsPanel({ isAdmin }: { isAdmin: boolean }) {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['access-requests'], queryFn: listAccessRequests });
  const [tiers, setTiers] = useState<Record<string, DbTier>>({});
  const [created, setCreated] = useState<{ email: string; token: string } | null>(null);
  const dismiss = useMutation({
    mutationFn: (id: string) => setAccessRequestStatus(id, 'dismissed'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['access-requests'] }),
  });
  const invite = useMutation({
    mutationFn: ({ id, tier }: { id: string; tier: DbTier }) => inviteFromAccessRequest(id, tier),
    onSuccess: (row) => {
      setCreated({ email: row.email, token: row.token });
      void qc.invalidateQueries({ queryKey: ['access-requests'] });
      void qc.invalidateQueries({ queryKey: ['invites'] });
    },
  });
  const rows = q.data ?? [];
  if (rows.length === 0 && !created) return null;

  const tierFor = (r: AccessRequestRow): DbTier =>
    tiers[r.id] ?? ((DB_TIERS as readonly string[]).includes(r.tier_interest ?? '') ? (r.tier_interest as DbTier) : 'retailer');
  const busy = invite.isPending || dismiss.isPending;

  return (
    <Panel title={`${t('Access requests')} (${rows.length} ${t('pending')})`} action={<Inbox className="h-4 w-4 text-muted-foreground" />}>
      {created && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-success/30 bg-success/5 px-3 py-2.5 text-sm">
          <span>
            {t('Invite created for')} <span className="font-mono">{created.email}</span>. {t('Send them this link — no e-mail goes out yet.')}
          </span>
          <CopyLink token={created.token} />
        </div>
      )}
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
                {r.tier_interest && <> · {t('wants')} {r.tier_interest}</>} · {formatDate(r.created_at, lang)}
              </p>
              {r.note && <p className="mt-0.5 max-w-md text-xs text-muted-foreground/80">“{r.note}”</p>}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {isAdmin && (
                <>
                  <label className="sr-only" htmlFor={`tier-${r.id}`}>{t('Tier')}</label>
                  <select
                    id={`tier-${r.id}`}
                    value={tierFor(r)}
                    onChange={(e) => setTiers((m) => ({ ...m, [r.id]: e.target.value as DbTier }))}
                    className="h-11 rounded-xl border border-border bg-background px-3 text-sm sm:h-9"
                  >
                    {DB_TIERS.map((tier) => (
                      <option key={tier} value={tier}>
                        {t(DB_TIER_LABELS[tier])}
                      </option>
                    ))}
                  </select>
                  <Button size="sm" className="min-h-11 sm:min-h-0" disabled={busy} onClick={() => invite.mutate({ id: r.id, tier: tierFor(r) })}>
                    {t('Invite')}
                  </Button>
                </>
              )}
              <Button size="sm" variant="ghost" className="min-h-11 sm:min-h-0" disabled={busy} onClick={() => dismiss.mutate(r.id)}>
                {t('Dismiss')}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {invite.isError && (
        <p className="mt-3 text-xs text-destructive">
          {(invite.error as Error).message.includes('email_taken')
            ? t('This e-mail already has an account.')
            : (invite.error as Error).message}
        </p>
      )}
      {!isAdmin && <p className="mt-3 text-xs text-muted-foreground">{t('Only an admin can send invites.')}</p>}
    </Panel>
  );
}

const TOPIC_LABEL: Record<ContactMessageRow['topic'], string> = {
  tier_pricing: 'Tier pricing',
  reseller: 'Become a reseller',
  bulk_quote: 'Bulk quote',
  order_support: 'Order support',
  other: 'Other',
};

/** New messages from the public Contact page. Reply by e-mail, then mark handled. */
function ContactMessagesPanel() {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['contact-messages'], queryFn: listContactMessages });
  const done = useMutation({
    mutationFn: (id: string) => markContactMessageHandled(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contact-messages'] }),
  });
  const rows = q.data ?? [];
  if (rows.length === 0) return null;

  return (
    <Panel title={`${t('Contact messages')} (${rows.length} ${t('new')})`} action={<Mail className="h-4 w-4 text-muted-foreground" />}>
      <ul className="divide-y divide-border">
        {rows.map((m) => (
          <li key={m.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {t(TOPIC_LABEL[m.topic])}
                {m.business_name && <span className="text-muted-foreground"> · {m.business_name}</span>}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                <a href={`mailto:${m.email}`} className="font-mono hover:underline">{m.email}</a> · {formatDate(m.created_at, lang)}
              </p>
              <p className="mt-1 whitespace-pre-line break-words text-sm text-muted-foreground">{m.message}</p>
            </div>
            <Button size="sm" variant="outline" className="min-h-11 shrink-0 sm:min-h-0" disabled={done.isPending} onClick={() => done.mutate(m.id)}>
              {t('Mark handled')}
            </Button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** Footer "Notify me" signups. Read-only: no e-mail is sent from here yet — copy
 * the addresses into the mailing tool. */
function NewsletterSignupsPanel() {
  const { t, lang } = useI18n();
  const q = useQuery({ queryKey: ['newsletter-signups'], queryFn: listNewsletterSignups });
  const total = q.data?.total ?? 0;
  const rows = q.data?.rows ?? [];
  if (total === 0) return null;

  return (
    <Panel title={`${t('Newsletter signups')} (${total})`} action={<AtSign className="h-4 w-4 text-muted-foreground" />}>
      <ul className="max-h-72 divide-y divide-border overflow-y-auto">
        {rows.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 py-2.5 first:pt-0">
            <a href={`mailto:${s.email}`} className="min-w-0 truncate font-mono text-sm hover:underline">{s.email}</a>
            <span className="shrink-0 text-xs text-muted-foreground">{formatDate(s.created_at, lang)}</span>
          </li>
        ))}
      </ul>
      {total > rows.length && (
        <p className="mt-3 text-xs text-muted-foreground">
          {t('Showing the newest')} {rows.length} {t('of')} {total}.
        </p>
      )}
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
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const q = useQuery({ queryKey: ['config-profiles'], queryFn: listProfiles });
  const customers = (q.data ?? []).filter((p) => p.role === 'customer');
  const terms = useAllAccountTerms();

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

      <UpgradeCandidatesPanel />
      <AccessRequestsPanel isAdmin={isAdmin} />
      <ContactMessagesPanel />
      <NewsletterSignupsPanel />

      <InvitePanel />

      {q.isLoading ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">{t('Loading customers…')}</div>
      ) : customers.length > 0 ? (
        <Table
          minWidth={720}
          columns={[
            { key: 'name', label: t('Account') },
            { key: 'tier', label: t('Tier') },
            { key: 'terms', label: t('Terms') },
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
              <Td className="text-xs text-muted-foreground">{t(TERMS_LABEL[terms.data?.get(c.parent_account_id ?? c.id)?.paymentTerms ?? 'cia'])}</Td>
              <Td className="text-muted-foreground">{formatDate(c.created_at, lang)}</Td>
              <Td align="right">
                <Link to={`/admin/customers/account/${c.parent_account_id ?? c.id}`} className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-brand hover:underline">
                  {t('Account')} <ArrowUpRight className="h-3 w-3" strokeWidth={2} />
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

/** Accounts whose lifetime volume earns a higher tier (staff decide; nothing changes on its own). */
function UpgradeCandidatesPanel() {
  const { t } = useI18n();
  const q = useTierUpgradeCandidates();
  const rows = q.data ?? [];
  if (rows.length === 0) return null;
  return (
    <Panel title={`${t('Eligible for a higher tier')} · ${rows.length}`}>
      <ul className="divide-y divide-border rounded-xl border border-border text-sm">
        {rows.map((r) => (
          <li key={r.account_id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
            <span className="min-w-0">
              <span className="block truncate font-medium">{r.display_name ?? r.email}</span>
              <span className="block text-xs text-muted-foreground">
                {r.units} {t('units bought')} · {r.tier ? t(DB_TIER_LABELS[r.tier]) : t('No tier')} → {t(DB_TIER_LABELS[r.volume_tier])}
              </span>
            </span>
            <Link to={`/admin/customers/account/${r.account_id}`} className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-brand hover:underline">
              {t('Account')} <ArrowUpRight className="h-3 w-3" strokeWidth={2} />
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
