import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GitMerge } from 'lucide-react';
import { listStockLocations, updateStockLocation, mergeLocations, type StockLocationRow, type MergeResult } from '@/data/adminConfig';
import { useAuth } from '@/store';
import { Panel } from '@/components/admin/parts';
import { Button } from '@/components/ui/Button';
import { ConfirmPassword } from '@/components/admin/ConfirmPassword';
import { Field, MutationError, TextInput, Toggle } from './parts';

function LocationRow({ row }: { row: StockLocationRow }) {
  const qc = useQueryClient();
  const [name, setName] = useState(row.display_name);
  const [region, setRegion] = useState(row.region ?? '');
  useEffect(() => {
    setName(row.display_name);
    setRegion(row.region ?? '');
  }, [row]);

  const save = useMutation({
    mutationFn: (patch: Partial<Pick<StockLocationRow, 'display_name' | 'region' | 'active'>>) => updateStockLocation(row.id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config-locations'] }),
  });

  const dirty = name !== row.display_name || (region || null) !== (row.region ?? null);

  return (
    <div className="rounded-2xl border border-border p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">{row.code}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{row.active ? 'Active' : 'Inactive'}</span>
          <Toggle label={`${row.code} active`} checked={row.active} onChange={(next) => save.mutate({ active: next })} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Display name" help="Customer-visible (D6).">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Region">
          <TextInput value={region} placeholder="—" onChange={(e) => setRegion(e.target.value)} />
        </Field>
      </div>
      <div className="mt-3 flex items-center justify-end gap-3">
        <Button size="sm" variant="outline" disabled={!dirty || !name.trim() || save.isPending} onClick={() => save.mutate({ display_name: name.trim(), region: region.trim() || null })}>
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
      <MutationError error={save.error} />
    </div>
  );
}

function MergePanel({ locations, canMerge }: { locations: StockLocationRow[]; canMerge: boolean }) {
  const qc = useQueryClient();
  const [fromCode, setFromCode] = useState('');
  const [toCode, setToCode] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<MergeResult | null>(null);

  const merge = useMutation({
    mutationFn: () => mergeLocations(fromCode, toCode),
    onSuccess: (r) => {
      setResult(r);
      setConfirmOpen(false);
      setFromCode('');
      setToCode('');
      qc.invalidateQueries({ queryKey: ['config-locations'] });
    },
  });

  const valid = fromCode && toCode && fromCode !== toCode;

  return (
    <Panel title="Merge locations" action={<GitMerge className="h-4 w-4 text-muted-foreground" />}>
      <p className="mb-4 text-sm text-muted-foreground">
        Fold one location's stock into another. Balances move via audited ledger movements (basis-cost-neutral), affected variants are repriced, and the
        source is <span className="font-medium text-foreground">deactivated</span> — its history stays intact, so it is never hard-deleted.
        {!canMerge && ' Admin-only.'}
      </p>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <Field label="Merge from (source)">
          <select
            value={fromCode}
            disabled={!canMerge}
            onChange={(e) => setFromCode(e.target.value)}
            className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand disabled:opacity-50"
          >
            <option value="">Select…</option>
            {locations.map((l) => (
              <option key={l.id} value={l.code}>
                {l.code} · {l.display_name}
              </option>
            ))}
          </select>
        </Field>
        <div className="hidden items-end pb-3 text-muted-foreground sm:flex">→</div>
        <Field label="Merge into (target)">
          <select
            value={toCode}
            disabled={!canMerge}
            onChange={(e) => setToCode(e.target.value)}
            className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand disabled:opacity-50"
          >
            <option value="">Select…</option>
            {locations
              .filter((l) => l.code !== fromCode)
              .map((l) => (
                <option key={l.id} value={l.code}>
                  {l.code} · {l.display_name}
                </option>
              ))}
          </select>
        </Field>
      </div>
      {canMerge && (
        <div className="mt-4 flex items-center gap-3">
          <Button size="sm" variant="brand" disabled={!valid || merge.isPending} onClick={() => setConfirmOpen(true)}>
            <GitMerge className="h-4 w-4" strokeWidth={2} />
            Merge
          </Button>
          {result && (
            <span className="text-sm text-success">
              Moved {result.variants_moved} variant{result.variants_moved === 1 ? '' : 's'} ({result.units_moved} units); {result.from_code} deactivated.
            </span>
          )}
        </div>
      )}
      <MutationError error={merge.error} />

      <ConfirmPassword
        open={confirmOpen}
        title={`Merge ${fromCode} into ${toCode}?`}
        description={`This moves all of ${fromCode}'s stock into ${toCode} and deactivates ${fromCode}. Confirm your password to proceed.`}
        actionLabel="Merge locations"
        busy={merge.isPending}
        onCancel={() => setConfirmOpen(false)}
        onConfirmed={() => merge.mutate()}
      />
    </Panel>
  );
}

export default function LocationsTab() {
  const { role } = useAuth();
  const q = useQuery({ queryKey: ['config-locations'], queryFn: listStockLocations });

  return (
    <div className="space-y-6">
      {q.isLoading && <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Loading locations…</div>}
      {q.isError && <MutationError error={q.error} />}

      {q.data && (
        <>
          <MergePanel locations={q.data} canMerge={role === 'admin'} />
          <div className="grid gap-4 lg:grid-cols-2">
            {q.data.map((row) => (
              <LocationRow key={row.id} row={row} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
