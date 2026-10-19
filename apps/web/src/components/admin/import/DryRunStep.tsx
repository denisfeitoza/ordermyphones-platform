import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { Panel, StatCard, Table, Td } from '@/components/admin/parts';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n';
import { formatUsd, formatInt } from '@/lib/format';
import { summarizeDryRun } from '@/lib/import/validate';
import type { CanonicalField } from '@/lib/import/map';
import { cn } from '@/lib/utils';
import type { DryRunState } from './types';
import { csvCell } from '@/lib/export';
import type { CommitProgress } from '@/lib/import/commit';

const RENDER_CAP = 200;

const WARNING_LABEL: Record<string, string> = {
  carrier_unmapped: 'unrecognized carrier (defaulted OTH)',
  grade_unmapped: 'unrecognized grade (queued for review)',
  model_number_derived: 'no model number — built from the model name',
  category_defaulted: 'no category — imported as phones',
};

const REJECT_REASON_LABEL: Record<string, string> = {
  missing_mandatory: 'Missing make, model, capacity or location',
  bad_category: 'Category not recognized (use phones, accessories or wearables)',
  bad_cost: 'Cost is zero, negative, or unparseable',
  bad_qty: 'Quantity is unparseable',
};

export function DryRunStep({
  dryRun,
  onBack,
  onCommit,
  busy,
  progress,
}: {
  dryRun: DryRunState;
  onBack: () => void;
  onCommit: () => void;
  busy: boolean;
  progress: CommitProgress | null;
}) {
  const { t } = useI18n();
  const summary = useMemo(() => summarizeDryRun(dryRun.validated), [dryRun.validated]);
  const [view, setView] = useState<'all' | 'rejected' | 'warnings'>('all');
  const filtered = useMemo(
    () => (view === 'all' ? dryRun.validated : view === 'rejected' ? dryRun.validated.filter((v) => !v.accepted) : dryRun.validated.filter((v) => v.accepted && v.warnings.length > 0)),
    [dryRun.validated, view],
  );
  const shown = filtered.slice(0, RENDER_CAP);
  const problems = useMemo(() => dryRun.validated.filter((v) => !v.accepted || v.warnings.length > 0), [dryRun.validated]);

  // Every rejected/warned row with its spreadsheet row number, to fix in the source file.
  function downloadProblems() {
    const lines = [
      ['Row', 'Status', 'Reason', 'Make', 'Model', 'Model number', 'Capacity', 'SKU'],
      ...problems.map((v) => [
        v.row.rowNumber,
        v.accepted ? 'warning' : 'rejected',
        v.accepted ? v.warnings.map((w) => WARNING_LABEL[w] ?? w).join('; ') : (REJECT_REASON_LABEL[v.rejectReason ?? ''] ?? v.rejectReason ?? ''),
        v.row.make,
        v.row.model,
        v.row.modelNumber,
        v.row.capacity,
        v.row.sku,
      ]),
    ];
    const url = URL.createObjectURL(new Blob([lines.map((l) => l.map(csvCell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'import-problems.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const mappingEntries = Array.from(dryRun.columnMap.entries()) as Array<[string, CanonicalField]>;

  const warningCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of dryRun.validated) {
      for (const w of v.warnings) counts.set(w, (counts.get(w) ?? 0) + 1);
    }
    return counts;
  }, [dryRun.validated]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label={t('Rows in file')} value={formatInt(summary.rowsTotal)} />
        <StatCard label={t('Accepted')} value={formatInt(summary.rowsAccepted)} accent="text-success" />
        <StatCard label={t('Rejected')} value={formatInt(summary.rowsRejected)} accent={summary.rowsRejected > 0 ? 'text-destructive' : ''} />
        <StatCard label={t('Distinct SKUs')} value={formatInt(summary.distinctSkus)} />
      </div>

      {(warningCounts.size > 0 || summary.rowsRejected > 0) && (
        <Panel title={t('Summary')}>
          <div className="flex flex-wrap gap-2">
            {Object.entries(summary.rejectsByReason).map(([reason, count]) => (
              <span key={reason} className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive">
                {formatInt(count)} {t('rejected')} — {t(REJECT_REASON_LABEL[reason] ?? reason)}
              </span>
            ))}
            {Array.from(warningCounts.entries()).map(([warning, count]) => (
              <span key={warning} className="inline-flex items-center gap-1.5 rounded-full bg-warning/10 px-3 py-1 text-xs font-medium text-warning">
                {formatInt(count)} {t('rows')} — {t(WARNING_LABEL[warning] ?? warning)}
              </span>
            ))}
          </div>
        </Panel>
      )}

      <Panel title={t('Mapping used')}>
        <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm">
          {mappingEntries.map(([column, field]) => (
            <span key={column} className="text-muted-foreground">
              <span className="font-medium text-foreground">{column}</span> → {field}
            </span>
          ))}
        </div>
      </Panel>

      <Panel
        title={t('Row preview')}
        action={
          problems.length > 0 ? (
            <Button size="sm" variant="outline" onClick={downloadProblems}>
              <Download className="h-4 w-4" strokeWidth={2} />
              {t('Problem rows (CSV)')}
            </Button>
          ) : undefined
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {(['all', 'rejected', 'warnings'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setView(k)}
              className={cn(
                'min-h-11 rounded-full border px-3.5 text-sm font-medium transition-colors sm:min-h-9',
                view === k ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:bg-muted',
              )}
            >
              {k === 'all' ? t('All rows') : k === 'rejected' ? t('Rejected') : t('With warnings')}
            </button>
          ))}
          {filtered.length > RENDER_CAP && (
            <span className="text-xs text-muted-foreground">
              {t('showing')} {formatInt(RENDER_CAP)} {t('of')} {formatInt(filtered.length)} {t('rows')}
            </span>
          )}
        </div>
        <Table
          minWidth={860}
          columns={[
            { key: 'row', label: '#' },
            { key: 'product', label: t('Product') },
            { key: 'sku', label: 'SKU' },
            { key: 'qty', label: t('Qty'), align: 'right' },
            { key: 'cost', label: t('Cost'), align: 'right' },
            { key: 'wh', label: t('Location') },
            { key: 'status', label: t('Status') },
          ]}
        >
          {shown.map((v) => (
            <tr key={v.row.rowNumber} className={cn(!v.accepted && 'bg-destructive/5')}>
              <Td className="font-mono text-xs text-muted-foreground">{v.row.rowNumber}</Td>
              <Td className="max-w-[16rem] truncate text-sm">
                {v.row.make} {v.row.model}
                {v.row.capacity ? ` · ${v.row.capacity}` : ''}
              </Td>
              <Td className="font-mono text-xs">{v.row.sku}</Td>
              <Td align="right" className="font-mono tabular-nums">
                {v.row.qty === null ? '—' : `${formatInt(v.row.qty)}${v.row.qtyIsFloor ? '+' : ''}`}
              </Td>
              <Td align="right" className="font-mono tabular-nums">{v.row.costCents === null ? '—' : formatUsd(v.row.costCents)}</Td>
              <Td>{v.row.warehouseCode || '—'}</Td>
              <Td>
                {v.accepted ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
                    <span className="h-1.5 w-1.5 rounded-full bg-success" />
                    {t('Accepted')}
                    {v.warnings.length > 0 && <span className="text-warning">· {v.warnings.map((w) => t(WARNING_LABEL[w] ?? w)).join(', ')}</span>}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive">
                    <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                    {t(REJECT_REASON_LABEL[v.rejectReason ?? ''] ?? v.rejectReason ?? '')}
                  </span>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      </Panel>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} disabled={busy}>
          {t('Back')}
        </Button>
        <Button onClick={onCommit} disabled={busy || summary.rowsAccepted === 0}>
          {!busy
            ? `${t('Commit')} ${formatInt(summary.rowsAccepted)} ${t('rows')}`
            : progress?.phase === 'reprice'
              ? `${t('Updating prices…')} ${formatInt(progress.done)}/${formatInt(progress.total)}`
              : progress
                ? `${t('Committing…')} ${formatInt(progress.done)}/${formatInt(progress.total)}`
                : t('Committing…')}
        </Button>
      </div>
    </div>
  );
}
