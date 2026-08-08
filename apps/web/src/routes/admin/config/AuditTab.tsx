import { useQuery } from '@tanstack/react-query';
import { listAdminAudit, type AdminAuditRow } from '@/data/adminConfig';
import { useAuth } from '@/store';
import { useI18n } from '@/i18n';
import { Panel, Table, Td } from '@/components/admin/parts';
import { AdminOnlyNote, MutationError } from './parts';
import { cn } from '@/lib/utils';

const ACTION_TONE: Record<string, string> = {
  set_user_role: 'bg-brand/15 text-brand',
  set_customer_tier: 'bg-secondary text-foreground',
  merge_locations: 'bg-warning/15 text-warning',
  reprice_all: 'bg-muted text-muted-foreground',
  resolve_grade_classification: 'bg-muted text-muted-foreground',
  viewed_as: 'bg-muted text-muted-foreground',
};

function detailSummary(row: AdminAuditRow, t: (en: string) => string): string {
  const d = row.detail ?? {};
  switch (row.action) {
    case 'set_user_role':
    case 'set_customer_tier':
      return `${d.from ?? '?'} → ${d.to ?? '?'}${d.reason ? ` · ${d.reason}` : ''}`;
    case 'merge_locations':
      return `${d.from_code} → ${d.to_code} · ${d.variants_moved} ${t('variants')}, ${d.units_moved} ${t('units')}`;
    case 'reprice_all':
      return `${d.variant_count} ${t('variants')}`;
    case 'resolve_grade_classification':
      return `${d.vendor_code}/${d.vendor_grade} → ${d.ctia} · ${d.variants_repriced} ${t('repriced')}`;
    default:
      return '';
  }
}

export default function AuditTab() {
  const { t } = useI18n();
  const { role } = useAuth();
  const q = useQuery({ queryKey: ['config-admin-audit'], queryFn: () => listAdminAudit(150), enabled: role === 'admin' });

  if (role !== 'admin') {
    return <AdminOnlyNote show />;
  }

  return (
    <Panel title={t('Admin action audit')}>
      <p className="mb-4 text-sm text-muted-foreground">
        {t('Every sensitive admin action — role and tier changes, location merges, full repricing, grade classifications, and view-as sessions.')}
      </p>
      {q.isLoading && <p className="text-sm text-muted-foreground">{t('Loading audit…')}</p>}
      {q.isError && <MutationError error={q.error} />}
      {q.data && q.data.length === 0 && <p className="text-sm text-muted-foreground">{t('No admin actions recorded yet.')}</p>}
      {q.data && q.data.length > 0 && (
        <Table
          minWidth={760}
          columns={[
            { key: 'when', label: t('When') },
            { key: 'actor', label: t('Actor') },
            { key: 'action', label: t('Action') },
            { key: 'target', label: t('Target') },
            { key: 'detail', label: t('Detail') },
          ]}
        >
          {q.data.map((row) => (
            <tr key={row.id} className="hover:bg-muted/40">
              <Td className="whitespace-nowrap text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</Td>
              <Td className="text-xs">{row.actor?.email ?? '—'}</Td>
              <Td>
                <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', ACTION_TONE[row.action] ?? 'bg-muted text-muted-foreground')}>{row.action}</span>
              </Td>
              <Td className="text-xs">{row.target?.email ?? '—'}</Td>
              <Td className="text-xs text-muted-foreground">{detailSummary(row, t)}</Td>
            </tr>
          ))}
        </Table>
      )}
    </Panel>
  );
}
