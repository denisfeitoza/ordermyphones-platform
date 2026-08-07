import { Panel, Table, Td } from '@/components/admin/parts';
import { Button } from '@/components/ui/Button';
import { CANONICAL_FIELDS, type CanonicalField } from '@/lib/import/map';
import { cn } from '@/lib/utils';
import type { ColumnAssignment } from './types';

const FIELD_LABEL: Record<CanonicalField, string> = {
  make: 'Make',
  model: 'Model',
  model_number: 'Model number',
  category: 'Category',
  capacity: 'Capacity',
  color: 'Color',
  grade: 'Grade',
  carrier: 'Carrier',
  lock_status: 'Lock status',
  currency: 'Currency',
  quantity: 'Quantity',
  cost: 'Cost',
  warehouse: 'Warehouse / location',
  description: 'Description (unused)',
};

export function MapStep({
  assignments,
  onFieldChange,
  onConfirm,
  onBack,
  busy,
}: {
  assignments: ColumnAssignment[];
  onFieldChange: (column: string, field: CanonicalField | 'ignore') => void;
  onConfirm: () => void;
  onBack: () => void;
  busy: boolean;
}) {
  const needsReviewCount = assignments.filter((a) => a.needsReview).length;
  const mappedCount = assignments.filter((a) => a.field !== 'ignore').length;

  return (
    <div className="space-y-4">
      <Panel
        title="Column mapping"
        action={
          <span className="text-xs text-muted-foreground">
            {mappedCount} of {assignments.length} columns mapped
            {needsReviewCount > 0 && ` · ${needsReviewCount} need review`}
          </span>
        }
      >
        <p className="mb-4 text-sm text-muted-foreground">
          High-confidence columns were mapped automatically. Columns highlighted amber need a human eye — check the sample
          values and confirm or fix the field before running the dry run.
        </p>

        <Table
          minWidth={720}
          columns={[
            { key: 'column', label: 'Sheet column' },
            { key: 'samples', label: 'Sample values' },
            { key: 'field', label: 'Maps to' },
          ]}
        >
          {assignments.map((a) => (
            <tr key={a.column} className={cn(a.needsReview && a.field !== 'ignore' && 'bg-warning/5')}>
              <Td className="font-medium">{a.column}</Td>
              <Td className="text-xs text-muted-foreground">
                {a.sampleValues.length > 0 ? a.sampleValues.join(', ') : <span className="italic">empty</span>}
              </Td>
              <Td>
                <select
                  value={a.field}
                  onChange={(e) => onFieldChange(a.column, e.target.value as CanonicalField | 'ignore')}
                  className={cn(
                    'h-9 rounded-lg border bg-background px-2.5 text-sm outline-none transition-colors focus:border-brand',
                    a.needsReview && a.field !== 'ignore' ? 'border-warning' : 'border-border',
                  )}
                >
                  <option value="ignore">Ignore</option>
                  {CANONICAL_FIELDS.map((f) => (
                    <option key={f} value={f}>
                      {FIELD_LABEL[f]}
                    </option>
                  ))}
                </select>
              </Td>
            </tr>
          ))}
        </Table>
      </Panel>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} disabled={busy}>
          Back
        </Button>
        <Button onClick={onConfirm} disabled={busy}>
          {busy ? 'Running dry run…' : 'Confirm mapping → dry run'}
        </Button>
      </div>
    </div>
  );
}
