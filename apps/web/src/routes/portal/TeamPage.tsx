import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Loader2, Mail, MessageCircle, Send, Users, X } from 'lucide-react';
import { useAuth } from '@/store';
import { inviteLink, DB_TIER_LABELS, type InviteRow } from '@/lib/invites';
import {
  canManageSubAccounts,
  createSubAccountInvite,
  listSubAccountInvites,
  listSubAccounts,
  removeSubAccount,
  revokeSubAccountInvite,
} from '@/data/subAccounts';
import { PageHeading } from '@/components/portal/parts';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';

const STATUS_TONE: Record<InviteRow['status'], string> = {
  pending: 'bg-warning/10 text-warning',
  accepted: 'bg-success/10 text-success',
  revoked: 'bg-muted text-muted-foreground',
};

const fmtDate = formatDate;

function isExpired(row: InviteRow): boolean {
  return row.status === 'pending' && new Date(row.expires_at).getTime() < Date.now();
}

/** Copy-to-clipboard button that flips to a check for ~1.5s. Same pattern as components/admin/InvitePanel.tsx. */
function CopyLink({ token }: { token: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const link = inviteLink(token);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(link);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          window.prompt(t('Copy the invite link'), link);
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? t('Copied') : t('Copy link')}
    </button>
  );
}

/**
 * Portal → Team. Self-service sub-account invites for wholesale/distributor
 * account owners (public.create_sub_account_invite, gated by
 * is_account_owner()). A sub-account inherits the owner's tier and shares the
 * owner's address book (public.addresses, scoped by account_id) — it sees a
 * read-only notice here instead of the invite form. 20260911100000_sub_accounts.sql.
 */
export default function TeamPage() {
  const { t, lang } = useI18n();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [justCreated, setJustCreated] = useState<InviteRow | null>(null);

  const isOwner = canManageSubAccounts(profile?.tier ?? null, profile?.parent_account_id ?? null);
  const isSubAccount = !!profile?.parent_account_id;

  const ownerId = profile?.id ?? '';
  const invitesQuery = useQuery({ queryKey: ['sub-account-invites', ownerId], queryFn: () => listSubAccountInvites(ownerId), enabled: isOwner && !!ownerId });
  const membersQuery = useQuery({ queryKey: ['sub-accounts', ownerId], queryFn: () => listSubAccounts(ownerId), enabled: isOwner && !!ownerId });

  const remove = useMutation({
    mutationFn: (id: string) => removeSubAccount(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sub-accounts'] }),
  });

  const create = useMutation({
    mutationFn: () => createSubAccountInvite(email),
    onSuccess: (row) => {
      setJustCreated(row);
      setEmail('');
      qc.invalidateQueries({ queryKey: ['sub-account-invites'] });
    },
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeSubAccountInvite(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sub-account-invites'] }),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (create.isPending || !email.trim()) return;
    create.mutate();
  }

  if (isSubAccount) {
    return (
      <div className="space-y-6">
        <PageHeading title={t('Team')} subtitle={t('Sub-account logins under a wholesale or distributor account.')} />
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          <Users className="mb-2 h-5 w-5" strokeWidth={2} />
          {t('This login is a sub-account. It shares its parent account’s tier and address book. Only the account owner can invite or remove sub-accounts.')}
        </div>
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="space-y-6">
        <PageHeading title={t('Team')} subtitle={t('Sub-account logins under a wholesale or distributor account.')} />
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          {t('Sub-accounts are available on Wholesale and Distributor tiers.')}
        </div>
      </div>
    );
  }

  const invites = invitesQuery.data ?? [];
  const members = membersQuery.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeading
        title={t('Team')}
        subtitle={t('Invite additional logins under this account — every sub-account shares your tier and your saved shipping addresses.')}
      />

      <div className="rounded-2xl border border-border bg-card p-5">
        <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="text-sm font-medium">{t('Email')}</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@yourcompany.com"
              className="h-11 rounded-xl border border-border bg-background px-3.5 text-sm outline-none transition-colors focus:border-brand"
            />
          </label>
          <Button type="submit" size="md" disabled={create.isPending}>
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {t('Invite sub-account')}
          </Button>
        </form>

        {create.isError && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {t('Could not create the invite:')} {(create.error as Error).message}
          </p>
        )}

        {justCreated && (() => {
          const link = inviteLink(justCreated.token);
          const message = `${t('You’ve been invited to join a team on OrderMyPhones. Set your password and sign in here:')} ${link}`;
          const subject = t('Your OrderMyPhones team invite');
          const waHref = `https://wa.me/?text=${encodeURIComponent(message)}`;
          const mailHref = `mailto:${encodeURIComponent(justCreated.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
          return (
            <div className="mt-4 rounded-xl border border-success/30 bg-success/5 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-success">
                <Check className="h-4 w-4" /> {t('Invite ready for')} {justCreated.email}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('No email is sent automatically — copy this link and send it yourself. Opening it lets your teammate set a password and sign in.')}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg bg-background px-2.5 py-1.5 text-xs">{link}</code>
                <CopyLink token={justCreated.token} />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <a href={waHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted">
                  <MessageCircle className="h-3.5 w-3.5" /> {t('Send on WhatsApp')}
                </a>
                <a href={mailHref} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted">
                  <Mail className="h-3.5 w-3.5" /> {t('Send by email')}
                </a>
              </div>
            </div>
          );
        })()}
      </div>

      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t('Sub-accounts')} {profile?.tier && `· ${DB_TIER_LABELS[profile.tier]}`}
        </h3>
        {membersQuery.isPending ? (
          <p className="text-sm text-muted-foreground">{t('Loading…')}</p>
        ) : members.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('No sub-accounts yet — invite one above.')}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {members.map((m) => (
              <div key={m.id} className="flex items-start justify-between gap-3 rounded-2xl border border-border bg-card p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{m.display_name || m.email}</p>
                  <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{t('Joined')} {fmtDate(m.created_at, lang)}</p>
                </div>
                <button
                  type="button"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (window.confirm(`${t('Remove this login from your account?')} ${m.email}\n${t('They will be signed out and lose access for good.')}`)) remove.mutate(m.id);
                  }}
                  className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground hover:border-destructive/40 hover:text-destructive disabled:opacity-50"
                >
                  {t('Remove')}
                </button>
              </div>
            ))}
            {remove.isError && (
              <p className="text-sm text-destructive sm:col-span-2">{remove.error instanceof Error ? remove.error.message : t('Could not remove this login.')}</p>
            )}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('Pending invites')}</h3>
        {invitesQuery.isPending ? (
          <p className="text-sm text-muted-foreground">{t('Loading…')}</p>
        ) : invites.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('No invites yet.')}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm" style={{ minWidth: 560 }}>
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-medium">{t('Email')}</th>
                  <th className="px-3 py-2 font-medium">{t('Status')}</th>
                  <th className="px-3 py-2 font-medium">{t('Expires')}</th>
                  <th className="px-3 py-2 font-medium text-right">{t('Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invites.map((r) => {
                  const expired = isExpired(r);
                  return (
                    <tr key={r.id} className="hover:bg-muted/40">
                      <td className="px-3 py-2 font-medium">{r.email}</td>
                      <td className="px-3 py-2">
                        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize', expired ? 'bg-destructive/10 text-destructive' : STATUS_TONE[r.status])}>
                          {expired ? t('expired') : r.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{fmtDate(r.expires_at, lang)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-2">
                          {r.status === 'pending' && !expired && <CopyLink token={r.token} />}
                          {r.status === 'pending' && (
                            <button
                              type="button"
                              onClick={() => revoke.mutate(r.id)}
                              disabled={revoke.isPending}
                              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                            >
                              <X className="h-3.5 w-3.5" /> {t('Revoke')}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
