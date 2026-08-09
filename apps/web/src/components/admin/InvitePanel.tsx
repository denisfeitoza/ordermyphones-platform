import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Loader2, Mail, MessageCircle, Send, X } from 'lucide-react';
import {
  createInvite,
  inviteLink,
  listInvites,
  revokeInvite,
  DB_TIERS,
  DB_TIER_LABELS,
  type DbTier,
  type InviteRow,
} from '@/lib/invites';
import { Panel } from '@/components/admin/parts';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

const STATUS_TONE: Record<InviteRow['status'], string> = {
  pending: 'bg-warning/10 text-warning',
  accepted: 'bg-success/10 text-success',
  revoked: 'bg-muted text-muted-foreground',
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isExpired(row: InviteRow): boolean {
  return row.status === 'pending' && new Date(row.expires_at).getTime() < Date.now();
}

/** Copy-to-clipboard button that flips to a check for ~1.5s. */
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
          // clipboard blocked — fall back to a prompt so the admin can still grab it
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

export function InvitePanel() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [tier, setTier] = useState<DbTier>('retailer');
  const [justCreated, setJustCreated] = useState<InviteRow | null>(null);

  const invitesQuery = useQuery({ queryKey: ['invites'], queryFn: listInvites });

  const create = useMutation({
    mutationFn: () => createInvite(email, tier),
    onSuccess: (row) => {
      setJustCreated(row);
      setEmail('');
      qc.invalidateQueries({ queryKey: ['invites'] });
    },
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeInvite(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invites'] }),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (create.isPending || !email.trim()) return;
    create.mutate();
  }

  const rows = invitesQuery.data ?? [];

  return (
    <Panel title={t('Invite a customer')}>
      <p className="mb-4 text-sm text-muted-foreground">
        {t('Accounts are invite-only. Create an invite, then copy the link and send it to the customer — email delivery is off in this build (toggle')}{' '}
        <code className="rounded bg-muted px-1">invite_email_delivery</code>
        {t('). The link carries the tier and email; the customer only sets a name and password.')}
      </p>

      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">{t('Customer email')}</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="buyer@store.com"
            className="h-11 rounded-xl border border-border bg-background px-3.5 text-sm outline-none transition-colors focus:border-brand"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t('Tier')}</span>
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value as DbTier)}
            className="h-11 cursor-pointer rounded-xl border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-brand"
          >
            {DB_TIERS.map((tt) => (
              <option key={tt} value={tt}>
                {DB_TIER_LABELS[tt]}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="md" disabled={create.isPending}>
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {t('Create invite')}
        </Button>
      </form>

      {create.isError && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {t('Could not create the invite:')} {(create.error as Error).message}
        </p>
      )}

      {justCreated && (() => {
        const link = inviteLink(justCreated.token);
        const message = `${t('You’ve been invited to OrderMyPhones. Set your password and start ordering here:')} ${link}`;
        const subject = t('Your OrderMyPhones invite');
        const waHref = `https://wa.me/?text=${encodeURIComponent(message)}`;
        const mailHref = `mailto:${encodeURIComponent(justCreated.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
        return (
          <div className="mt-4 rounded-xl border border-success/30 bg-success/5 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-success">
              <Check className="h-4 w-4" /> {t('Invite ready for')} {justCreated.email} · {DB_TIER_LABELS[justCreated.tier]}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('No email is sent automatically — copy this link and send it to the customer yourself. Opening it lets them set a password and sign in.')}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-background px-2.5 py-1.5 text-xs">{link}</code>
              <CopyLink token={justCreated.token} />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted"
              >
                <MessageCircle className="h-3.5 w-3.5" /> {t('Send on WhatsApp')}
              </a>
              <a
                href={mailHref}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted"
              >
                <Mail className="h-3.5 w-3.5" /> {t('Send by email')}
              </a>
            </div>
          </div>
        );
      })()}

      <div className="mt-6">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('Invites')}</h3>
        {invitesQuery.isPending ? (
          <p className="text-sm text-muted-foreground">{t('Loading…')}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('No invites yet.')}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm" style={{ minWidth: 640 }}>
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-medium">{t('Email')}</th>
                  <th className="px-3 py-2 font-medium">{t('Tier')}</th>
                  <th className="px-3 py-2 font-medium">{t('Status')}</th>
                  <th className="px-3 py-2 font-medium">{t('Expires')}</th>
                  <th className="px-3 py-2 font-medium text-right">{t('Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => {
                  const expired = isExpired(r);
                  return (
                    <tr key={r.id} className="hover:bg-muted/40">
                      <td className="px-3 py-2 font-medium">{r.email}</td>
                      <td className="px-3 py-2">{DB_TIER_LABELS[r.tier]}</td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize',
                            expired ? 'bg-destructive/10 text-destructive' : STATUS_TONE[r.status],
                          )}
                        >
                          {expired ? t('expired') : r.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{fmtDate(r.expires_at)}</td>
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
    </Panel>
  );
}
