import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listPricingSettings, setPricingSetting, type PricingSettingRow } from '@/data/adminConfig';
import { PRICING_KEYS, PRICING_KEY_META, validatePricingValue, type PricingKeyMeta } from '@/lib/pricingSettings';
import { useAuth } from '@/store';
import { Panel } from '@/components/admin/parts';
import { Button } from '@/components/ui/Button';
import { AdminOnlyNote, Field, MoneyCentsInput, MutationError, TextInput } from './parts';

/** Scalar editor — cents/fraction/posint/multiplier — returns the parsed value. */
function ScalarEditor({ meta, value, onSave, canEdit }: { meta: PricingKeyMeta; value: unknown; onSave: (v: unknown) => void; canEdit: boolean }) {
  const [draft, setDraft] = useState<number>(typeof value === 'number' ? value : 0);
  useEffect(() => setDraft(typeof value === 'number' ? value : 0), [value]);

  const error = validatePricingValue(meta.kind, draft);
  const dirty = draft !== value;

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-40">
        {meta.kind === 'cents' ? (
          <MoneyCentsInput ariaLabel={meta.label} cents={draft} disabled={!canEdit} onChange={setDraft} />
        ) : (
          <TextInput
            type="number"
            step={meta.kind === 'posint' ? '1' : '0.001'}
            value={draft}
            disabled={!canEdit}
            aria-label={meta.label}
            onChange={(e) => setDraft(Number(e.target.value))}
          />
        )}
      </div>
      {canEdit && (
        <Button size="sm" variant="outline" disabled={!dirty || !!error} onClick={() => onSave(draft)}>
          Save
        </Button>
      )}
      {error && dirty && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}

/** JSON editor for bands / multipliers with live validation. */
function JsonEditor({ meta, value, onSave, canEdit }: { meta: PricingKeyMeta; value: unknown; onSave: (v: unknown) => void; canEdit: boolean }) {
  const [text, setText] = useState(() => JSON.stringify(value ?? null, null, 2));
  useEffect(() => setText(JSON.stringify(value ?? null, null, 2)), [value]);

  let parsed: unknown;
  let parseError: string | null = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parseError = 'Invalid JSON.';
  }
  const validationError = parseError ?? validatePricingValue(meta.kind, parsed);
  const dirty = text !== JSON.stringify(value ?? null, null, 2);

  return (
    <div className="space-y-2">
      <textarea
        value={text}
        disabled={!canEdit}
        onChange={(e) => setText(e.target.value)}
        rows={meta.kind === 'bands' ? 8 : 6}
        spellCheck={false}
        aria-label={meta.label}
        className="w-full rounded-xl border border-border bg-background p-3 font-mono text-xs outline-none transition-colors focus:border-brand disabled:opacity-50"
      />
      <div className="flex items-center gap-3">
        {canEdit && (
          <Button size="sm" variant="outline" disabled={!dirty || !!validationError} onClick={() => onSave(parsed)}>
            Save
          </Button>
        )}
        {validationError && dirty && <span className="text-xs text-destructive">{validationError}</span>}
      </div>
    </div>
  );
}

export default function PricingTab() {
  const { role } = useAuth();
  const canEdit = role === 'admin';
  const qc = useQueryClient();
  const settingsQ = useQuery({ queryKey: ['config-pricing'], queryFn: listPricingSettings });

  const save = useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) => setPricingSetting(key, value),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config-pricing'] }),
  });

  const byKey = new Map<string, PricingSettingRow>((settingsQ.data ?? []).map((r) => [r.key, r]));
  const scalarKeys = PRICING_KEYS.filter((m) => m.kind !== 'bands' && m.kind !== 'multipliers');
  const complexKeys = PRICING_KEYS.filter((m) => m.kind === 'bands' || m.kind === 'multipliers');

  return (
    <div className="space-y-6">
      <AdminOnlyNote show={!canEdit} />

      {settingsQ.isLoading && <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Loading pricing parameters…</div>}
      {settingsQ.isError && <MutationError error={settingsQ.error} />}
      <MutationError error={save.error} />

      {settingsQ.data && (
        <>
          <Panel title="Scalar parameters">
            <div className="space-y-5">
              {scalarKeys.map((meta) => (
                <Field key={meta.key} label={meta.label} help={meta.help}>
                  <ScalarEditor meta={meta} value={byKey.get(meta.key)?.value} canEdit={canEdit} onSave={(v) => save.mutate({ key: meta.key, value: v })} />
                </Field>
              ))}
            </div>
          </Panel>

          {complexKeys.map((meta) => (
            <Panel key={meta.key} title={meta.label}>
              <p className="mb-3 text-sm text-muted-foreground">{meta.help}</p>
              <JsonEditor meta={PRICING_KEY_META[meta.key]} value={byKey.get(meta.key)?.value} canEdit={canEdit} onSave={(v) => save.mutate({ key: meta.key, value: v })} />
            </Panel>
          ))}
        </>
      )}
    </div>
  );
}
