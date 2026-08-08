import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, ShieldCheck } from 'lucide-react';
import { listProfiles, setCustomerTier, setUserRole, type ProfileRow, type AppRoleName } from '@/data/adminConfig';
import { DB_TIERS, DB_TIER_LABELS, type DbTier } from '@/lib/invites';
import { useAuth } from '@/store';
import { useI18n } from '@/i18n';
import { InvitePanel } from '@/components/admin/InvitePanel';
import { ConfirmPassword } from '@/components/admin/ConfirmPassword';
import { Panel, Table, Td } from '@/components/admin/parts';
import { MutationError } from './parts';
import { cn } from '@/lib/utils';

const ROLE_TONE: Record<AppRoleName, string> = {
  admin: 'bg-brand/15 text-brand',
  staff: 'bg-secondary text-foreground',
  customer: 'bg-muted text-muted-foreground',
};

type PendingAction =
  | { kind: 'role'; user: ProfileRow; role: AppRoleName }
  | { kind: 'tier'; user: ProfileRow; tier: DbTier };

export default function UsersTab() {
  const { t } = useI18n();
  const { role: myRole, user: me } = useAuth();
  const isAdmin = myRole === 'admin';
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['config-profiles'], queryFn: listProfiles });
  const [pending, setPending] = useState<PendingAction | null>(null);

  const applyRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: AppRoleName }) => setUserRole(userId, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config-profiles'] }),
  });
  const applyTier = useMutation({
    mutationFn: ({ userId, tier }: { userId: string; tier: DbTier }) => setCustomerTier(userId, tier, 'admin console'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config-profiles'] }),
  });

  function confirmPending() {
    if (!pending) return;
    if (pending.kind === 'role') applyRole.mutate({ userId: pending.user.id, role: pending.role }, { onSettled: () => setPending(null) });
    else applyTier.mutate({ userId: pending.user.id, tier: pending.tier }, { onSettled: () => setPending(null) });
  }

  return (
    <div className="space-y-6">
      <InvitePanel />

      <Panel title={t('Accounts')}>
        <p className="mb-4 text-sm text-muted-foreground">
          {t("Every profile. Change a customer's tier or a user's role — both are audited and require you to re-confirm your password.")}
          {!isAdmin && ` ${t('Role/tier changes are admin-only.')}`}
        </p>
        {q.isLoading && <p className="text-sm text-muted-foreground">{t('Loading accounts…')}</p>}
        {q.isError && <MutationError error={q.error} />}
        <MutationError error={applyRole.error ?? applyTier.error} />

        {q.data && (
          <Table
            minWidth={860}
            columns={[
              { key: 'email', label: t('Account') },
              { key: 'role', label: t('Role') },
              { key: 'tier', label: t('Tier') },
              { key: 'flags', label: t('Flags') },
              { key: 'view', label: t('Lens'), align: 'right' },
            ]}
          >
            {q.data.map((u) => (
              <tr key={u.id} className="hover:bg-muted/40">
                <Td>
                  <span className="font-medium">{u.display_name || u.email}</span>
                  <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
                </Td>
                <Td>
                  {isAdmin ? (
                    <select
                      value={u.role}
                      aria-label={`${t('Role for')} ${u.email}`}
                      onChange={(e) => setPending({ kind: 'role', user: u, role: e.target.value as AppRoleName })}
                      className="h-8 rounded-lg border border-border bg-background px-2 text-xs outline-none focus:border-brand"
                    >
                      {(['admin', 'staff', 'customer'] as AppRoleName[]).map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  ) : (
                    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize', ROLE_TONE[u.role])}>{u.role}</span>
                  )}
                </Td>
                <Td>
                  {u.role === 'customer' ? (
                    isAdmin ? (
                      <select
                        value={u.tier ?? ''}
                        aria-label={`${t('Tier for')} ${u.email}`}
                        onChange={(e) => e.target.value && setPending({ kind: 'tier', user: u, tier: e.target.value as DbTier })}
                        className="h-8 rounded-lg border border-border bg-background px-2 text-xs outline-none focus:border-brand"
                      >
                        <option value="" disabled>{t('Unassigned')}</option>
                        {DB_TIERS.map((t) => (
                          <option key={t} value={t}>{DB_TIER_LABELS[t]}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs">{u.tier ? DB_TIER_LABELS[u.tier] : '—'}</span>
                    )
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </Td>
                <Td>
                  {u.is_test && <span className="inline-flex items-center rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-warning">{t('test')}</span>}
                  {u.id === me?.id && <span className="ml-1 inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium">{t('you')}</span>}
                </Td>
                <Td align="right">
                  {isAdmin && u.role !== 'admin' && (
                    <Link
                      to={`/admin/view-as/${u.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted"
                    >
                      <Eye className="h-3.5 w-3.5" /> {t('View as')}
                    </Link>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" /> {t('Role and tier changes write an audit row and re-verify your password. The last admin cannot be demoted.')}
      </p>

      <ConfirmPassword
        open={!!pending}
        title={pending?.kind === 'role' ? `${t('Change')} ${pending.user.email} ${t('to')} ${pending.role}?` : `${t('Change')} ${pending?.user.email}${t("'s tier?")}`}
        description={
          pending?.kind === 'role'
            ? t('This changes what the account can access. Confirm your password.')
            : `${t('Reassign to')} ${pending ? DB_TIER_LABELS[(pending as { tier: DbTier }).tier] : ''}. ${t("The customer will see the new tier's prices. Confirm your password.")}`
        }
        actionLabel={t('Apply change')}
        busy={applyRole.isPending || applyTier.isPending}
        onCancel={() => {
          setPending(null);
          qc.invalidateQueries({ queryKey: ['config-profiles'] }); // revert the optimistic <select> value
        }}
        onConfirmed={confirmPending}
      />
    </div>
  );
}
