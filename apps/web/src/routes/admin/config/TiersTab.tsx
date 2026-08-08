import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { listTiers, updateTier, repriceAll, type DbTierRow } from '@/data/adminConfig';
import { useAuth } from '@/store';
import { Panel } from '@/components/admin/parts';
import { Button } from '@/components/ui/Button';
import { formatInt, formatUsd } from '@/lib/format';
import { tierBg } from '@/lib/tierStyles';
import { cn } from '@/lib/utils';
import { AdminOnlyNote, Field, MoneyCentsInput, MutationError, TextInput } from './parts';

interface TierDraft {
  label: string;
  min_units: number;
  max_units: number | null;
  floor_cents: number;
}

function toDraft(r: DbTierRow): TierDraft {
  return { label: r.label, min_units: r.min_units, max_units: r.max_units, floor_cents: r.floor_cents };
}

const TONE: Record<string, '1' | '2' | '3' | '4'> = { consumer: '1', retailer: '2', wholesale: '3', distributor: '4' };

function TierCard({ row, canEdit }: { row: DbTierRow; canEdit: boolean }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<TierDraft>(() => toDraft(row));
  useEffect(() => setDraft(toDraft(row)), [row]);

  const save = useMutation({
    mutationFn: () => updateTier(row.code, draft),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config-tiers'] }),
  });

  const dirty =
    draft.label !== row.label || draft.min_units !== row.min_units || draft.max_units !== row.max_units || draft.floor_cents !== row.floor_cents;

  const invalid = draft.min_units < 0 || (draft.max_units !== null && draft.max_units < draft.min_units) || draft.floor_cents < 0 || !draft.label.trim();
  const range = `${formatInt(draft.min_units)}${draft.max_units === null ? '+' : `–${formatInt(draft.max_units)}`} units`;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-semibold">
          <span className={cn('h-2.5 w-2.5 rounded-full', tierBg[TONE[row.code] ?? '1'])} />
          {draft.label || row.label}
        </span>
        <span className="rounded-full bg-secondary px-2.5 py-0.5 font-mono text-xs tabular-nums text-muted-foreground">{range}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tier name" help="What customers see for their pricing.">
          <TextInput value={draft.label} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
        </Field>
        <Field label="Minimum price" help={`Never sell below ${formatUsd(draft.floor_cents)} at this tier.`}>
          <MoneyCentsInput ariaLabel={`${row.code} floor`} cents={draft.floor_cents} disabled={!canEdit} onChange={(c) => setDraft({ ...draft, floor_cents: c })} />
        </Field>
        <Field label="Qualifies from (units)" help="Buyers ordering at least this many get this tier.">
          <TextInput
            type="number"
            min="0"
            value={draft.min_units}
            disabled={!canEdit}
            onChange={(e) => setDraft({ ...draft, min_units: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
          />
        </Field>
        <Field label="Up to (units)" help="Leave blank for the top tier (no upper limit).">
          <TextInput
            type="number"
            min="0"
            value={draft.max_units ?? ''}
            disabled={!canEdit}
            placeholder="No limit"
            onChange={(e) => {
              const raw = e.target.value.trim();
              setDraft({ ...draft, max_units: raw === '' ? null : Math.max(0, Math.floor(Number(raw) || 0)) });
            }}
          />
        </Field>
      </div>
      {canEdit && (
        <div className="mt-3 flex items-center justify-end gap-3">
          {invalid && <span className="text-xs text-destructive">Check the price and unit range.</span>}
          <Button size="sm" variant="outline" disabled={!dirty || invalid || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : save.isSuccess && !dirty ? 'Saved ✓' : 'Save'}
          </Button>
        </div>
      )}
      <MutationError error={save.error} />
    </div>
  );
}

export default function TiersTab() {
  const { role } = useAuth();
  const canEdit = role === 'admin';
  const qc = useQueryClient();
  const tiersQ = useQuery({ queryKey: ['config-tiers'], queryFn: listTiers });

  const reprice = useMutation({ mutationFn: repriceAll });

  return (
    <div className="space-y-6">
      <AdminOnlyNote show={!canEdit} />

      <Panel
        title="Reprice everything"
        action={
          canEdit && (
            <Button
              size="sm"
              variant="brand"
              disabled={reprice.isPending}
              onClick={() => reprice.mutate()}
            >
              <RefreshCw className={reprice.isPending ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} strokeWidth={2} />
              Reprice all
            </Button>
          )
        }
      >
        <p className="text-sm text-muted-foreground">
          Editing a floor or a pricing parameter does <span className="font-medium text-foreground">not</span> retroactively reprice existing
          variants. Run this after changing floors/params to apply them everywhere.
        </p>
        {reprice.isSuccess && (
          <p className="mt-2 text-sm text-success">Repriced {formatInt(reprice.data)} variant{reprice.data === 1 ? '' : 's'}.</p>
        )}
        <MutationError error={reprice.error} />
      </Panel>

      {tiersQ.isLoading && <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Loading tiers…</div>}
      {tiersQ.isError && <MutationError error={tiersQ.error} />}

      {tiersQ.data && (
        <div className="grid gap-4 lg:grid-cols-2">
          {tiersQ.data.map((row) => (
            <TierCard key={row.code} row={row} canEdit={canEdit} />
          ))}
        </div>
      )}

      {tiersQ.data && (
        <button type="button" onClick={() => qc.invalidateQueries({ queryKey: ['config-tiers'] })} className="text-xs text-muted-foreground hover:text-foreground">
          Refresh
        </button>
      )}
    </div>
  );
}
