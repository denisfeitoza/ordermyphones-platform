import { useMemo } from 'react';
import { Panel, StatCard, Table, Td } from '@/components/admin/parts';
import { Button } from '@/components/ui/Button';
import { formatUsd, formatInt } from '@/lib/format';
import { summarizeDryRun } from '@/lib/import/validate';
import type { CanonicalField } from '@/lib/import/map';
import { cn } from '@/lib/utils';
import type { DryRunState } from './types';

const RENDER_CAP = 200;

const REJECT_REASON_LABEL: Record<string, string> = {
  missing_mandatory: 'Missing make/model/model number/capacity/location',
  bad_category: 'Category not phones/accessories/wearables',
  bad_cost: 'Cost is zero, negative, or unparseable',
  bad_qty: 'Quantity is unparseable',
};

export function DryRunStep({
  dryRun,
  onBack,
  onCommit,
  busy,
}: {
  dryRun: DryRunState;
  onBack: () => void;
  onCommit: () => void;
  busy: boolean;
}) {
  const summary = useMemo(() => summarizeDryRun(dryRun.validated), [dryRun.validated]);
  const shown = dryRun.validated.slice(0, RENDER_CAP);
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
        <StatCard label="Rows in file" value={formatInt(summary.rowsTotal)} />
        <StatCard label="Accepted" value={formatInt(summary.rowsAccepted)} accent="text-success" />
        <StatCard label="Rejected" value={formatInt(summary.rowsRejected)} accent={summary.rowsRejected > 0 ? 'text-destructive' : ''} />
        <StatCard label="Distinct SKUs" value={formatInt(summary.distinctSkus)} />
      </div>

      {(warningCounts.size > 0 || summary.rowsRejected > 0) && (
        <Panel title="Summary">
          <div className="flex flex-wrap gap-2">
            {Object.entries(summary.rejectsByReason).map(([reason, count]) => (
              <span key={reason} className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive">
                {formatInt(count)} rejected — {REJECT_REASON_LABEL[reason] ?? reason}
              </span>
            ))}
            {Array.from(warningCounts.entries()).map(([warning, count]) => (
              <span key={warning} className="inline-flex items-center gap-1.5 rounded-full bg-warning/10 px-3 py-1 text-xs font-medium text-warning">
                {formatInt(count)} rows — {warning === 'carrier_unmapped' ? 'unrecognized carrier (defaulted OTH)' : warning === 'grade_unmapped' ? 'unrecognized grade (queued for review)' : warning}
              </span>
            ))}
          </div>
        </Panel>
      )}

      <Panel title="Mapping used">
        <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm">
          {mappingEntries.map(([column, field]) => (
            <span key={column} className="text-muted-foreground">
              <span className="font-medium text-foreground">{column}</span> → {field}
            </span>
          ))}
        </div>
      </Panel>

      <Panel
        title="Row preview"
        action={
          dryRun.validated.length > RENDER_CAP ? (
            <span className="text-xs text-muted-foreground">
              showing {formatInt(RENDER_CAP)} of {formatInt(dryRun.validated.length)} rows
            </span>
          ) : undefined
        }
      >
        <Table
          minWidth={860}
          columns={[
            { key: 'row', label: '#' },
            { key: 'sku', label: 'SKU' },
            { key: 'qty', label: 'Qty', align: 'right' },
            { key: 'cost', label: 'Cost', align: 'right' },
            { key: 'wh', label: 'Location' },
            { key: 'status', label: 'Status' },
          ]}
        >
          {shown.map((v) => (
            <tr key={v.row.rowNumber} className={cn(!v.accepted && 'bg-destructive/5')}>
              <Td className="font-mono text-xs text-muted-foreground">{v.row.rowNumber}</Td>
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
                    Accepted
                    {v.warnings.length > 0 && <span className="text-warning">· {v.warnings.join(', ')}</span>}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive">
                    <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                    {REJECT_REASON_LABEL[v.rejectReason ?? ''] ?? v.rejectReason}
                  </span>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      </Panel>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} disabled={busy}>
          Back
        </Button>
        <Button onClick={onCommit} disabled={busy || summary.rowsAccepted === 0}>
          {busy ? 'Committing…' : `Commit ${formatInt(summary.rowsAccepted)} rows`}
        </Button>
      </div>
    </div>
  );
}
