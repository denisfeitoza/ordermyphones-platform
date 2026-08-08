import { Link } from 'react-router-dom';
import { ArrowUpRight, CheckCircle2, TriangleAlert } from 'lucide-react';
import { Panel, StatCard, Table, Td } from '@/components/admin/parts';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n';
import { formatInt } from '@/lib/format';
import type { CommitStockImportResult } from '@/lib/import/types';
import type { PreCommitInfo } from './types';

const RENDER_CAP = 100;

export function CommitStep({
  result,
  preCommit,
  profileSaveWarning,
  onStartNew,
}: {
  result: CommitStockImportResult;
  preCommit: PreCommitInfo;
  profileSaveWarning: string | null;
  onStartNew: () => void;
}) {
  const { t } = useI18n();
  // The RPC only ever sees ACCEPTED rows (rejected rows are never sent), so
  // result.rows_total/rows_rejected/reject_reasons describe that accepted-only
  // batch, not the sheet — the true "rows in file" / "rejected" figures and
  // reject reasons come from the dry-run the operator already approved.
  const rejects = preCommit.clientRejects.slice(0, RENDER_CAP);
  const warnings = result.warnings.slice(0, RENDER_CAP);

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-8 w-8 shrink-0 text-success" strokeWidth={1.5} />
          <div>
            <p className="font-medium">{t('Import committed')}</p>
            <p className="text-sm text-muted-foreground">{t('Run')} {result.import_run_id.slice(0, 8)} · {t('every change is an audited stock movement.')}</p>
          </div>
        </div>
      </Panel>

      {profileSaveWarning && (
        <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-warning">
          <TriangleAlert className="h-4 w-4 shrink-0 translate-y-0.5" strokeWidth={2} />
          <span>{t('The import committed successfully, but the mapping profile failed to save')} ({profileSaveWarning}) — {t('the next upload of this layout will need remapping.')}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label={t('Rows in file')} value={formatInt(preCommit.rowsInFile)} />
        <StatCard label={t('Accepted')} value={formatInt(result.rows_accepted)} accent="text-success" />
        <StatCard label={t('Rejected')} value={formatInt(preCommit.clientRejects.length)} accent={preCommit.clientRejects.length > 0 ? 'text-destructive' : ''} />
        <StatCard label={t('Movements written')} value={formatInt(result.movements_written)} />
      </div>

      {(rejects.length > 0 || warnings.length > 0) && (
        <Panel
          title={t('Row detail')}
          action={
            preCommit.clientRejects.length + result.warnings.length > RENDER_CAP ? (
              <span className="text-xs text-muted-foreground">{t('showing first')} {formatInt(RENDER_CAP)} {t('entries')}</span>
            ) : undefined
          }
        >
          <Table minWidth={480} columns={[{ key: 'row', label: t('Row') }, { key: 'type', label: t('Type') }, { key: 'reason', label: t('Reason') }]}>
            {[...rejects.map((r) => ({ ...r, type: 'reject' as const })), ...warnings].map((r, i) => (
              <tr key={`${r.type}-${r.row}-${i}`}>
                <Td className="font-mono text-xs">{r.row}</Td>
                <Td className={r.type === 'reject' ? 'text-destructive' : 'text-warning'}>{r.type === 'reject' ? t('Rejected') : t('Warning')}</Td>
                <Td className="text-sm">{r.reason}</Td>
              </tr>
            ))}
          </Table>
        </Panel>
      )}

      <div className="flex flex-wrap justify-between gap-3">
        <Button variant="outline" onClick={onStartNew}>
          {t('Start a new import')}
        </Button>
        <Link to="/admin/inventory">
          <Button variant="brand">
            {t('View inventory')}
            <ArrowUpRight className="h-4 w-4" strokeWidth={2} />
          </Button>
        </Link>
      </div>
    </div>
  );
}
