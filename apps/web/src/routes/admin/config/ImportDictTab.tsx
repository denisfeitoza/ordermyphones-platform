import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, Wand2 } from 'lucide-react';
import {
  listSynonyms,
  addSynonym,
  deleteSynonym,
  applyModelAliases,
  listImportProfiles,
  deleteImportProfile,
  type SynonymRow,
  type ImportProfileRow,
} from '@/data/adminConfig';
import { useAuth } from '@/store';
import { useI18n } from '@/i18n';
import { Panel, Table, Td } from '@/components/admin/parts';
import { Button } from '@/components/ui/Button';
import { AdminOnlyNote, Field, MutationError, TextInput } from './parts';

const CANONICAL_FIELDS = [
  'quantity', 'cost', 'carrier', 'warehouse', 'make', 'model', 'model_number', 'capacity', 'color', 'grade', 'lock_status', 'category', 'currency', 'description',
];

function SynonymSection({ canEdit }: { canEdit: boolean }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['config-synonyms'], queryFn: listSynonyms });
  const [field, setField] = useState('quantity');
  const [synonym, setSynonym] = useState('');
  const [kind, setKind] = useState<'header' | 'carrier_value'>('header');
  const [mapsTo, setMapsTo] = useState('');
  const [filter, setFilter] = useState('');

  const add = useMutation({
    mutationFn: (row: Omit<SynonymRow, 'id'>) => addSynonym(row),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config-synonyms'] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteSynonym(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config-synonyms'] }),
  });

  const rows = useMemo(() => {
    const list = q.data ?? [];
    const f = filter.trim().toLowerCase();
    if (!f) return list;
    return list.filter((r) => r.synonym.includes(f) || r.canonical_field.includes(f));
  }, [q.data, filter]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const s = synonym.trim().toLowerCase();
    if (!s) return;
    add.mutate(
      { canonical_field: field, synonym: s, kind, maps_to: kind === 'carrier_value' ? mapsTo.trim().toUpperCase() || null : null },
      { onSuccess: () => { setSynonym(''); setMapsTo(''); } },
    );
  }

  return (
    <Panel title={t('Synonym dictionary')}>
      <p className="mb-4 text-sm text-muted-foreground">
        {t('Maps raw spreadsheet header tokens (and raw carrier values) to canonical fields so supplier files auto-map. Synonyms are stored lower/trimmed.')}
      </p>
      {canEdit && (
        <form onSubmit={submit} className="mb-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
          <Field label={t('Canonical field')}>
            <select value={field} onChange={(e) => setField(e.target.value)} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand">
              {CANONICAL_FIELDS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </Field>
          <Field label={t('Synonym token')}>
            <TextInput value={synonym} onChange={(e) => setSynonym(e.target.value)} placeholder="qty" className="h-10" />
          </Field>
          <Field label={t('Kind')}>
            <select value={kind} onChange={(e) => setKind(e.target.value as 'header' | 'carrier_value')} className="h-10 rounded-xl border border-border bg-background px-2 text-sm outline-none focus:border-brand">
              <option value="header">header</option>
              <option value="carrier_value">carrier_value</option>
            </select>
          </Field>
          <Button type="submit" size="sm" disabled={add.isPending || !synonym.trim()}>{t('Add')}</Button>
          {kind === 'carrier_value' && (
            <Field label={t('Maps to carrier code')}>
              <TextInput value={mapsTo} onChange={(e) => setMapsTo(e.target.value)} placeholder="ATT" className="h-10" />
            </Field>
          )}
        </form>
      )}
      <MutationError error={add.error ?? remove.error} />

      <div className="mb-3 max-w-xs">
        <TextInput value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t('Filter synonyms…')} className="h-10" />
      </div>

      {q.isLoading && <p className="text-sm text-muted-foreground">{t('Loading dictionary…')}</p>}
      {q.data && rows.length === 0 && <p className="text-sm text-muted-foreground">{t('No matching synonyms.')}</p>}
      {rows.length > 0 && (
        <Table
          minWidth={640}
          columns={[
            { key: 'field', label: t('Field') },
            { key: 'synonym', label: t('Synonym') },
            { key: 'kind', label: t('Kind') },
            { key: 'maps', label: t('Maps to') },
            { key: 'action', label: '', align: 'right' },
          ]}
        >
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-muted/40">
              <Td className="font-medium">{r.canonical_field}</Td>
              <Td className="font-mono text-xs">{r.synonym}</Td>
              <Td className="text-muted-foreground">{r.kind}</Td>
              <Td className="font-mono text-xs">{r.maps_to ?? '—'}</Td>
              <Td align="right">
                {canEdit && (
                  <button type="button" aria-label={`${t('Delete synonym')} ${r.synonym}`} onClick={() => remove.mutate(r.id)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </Panel>
  );
}

function ModelAliasSection({ canEdit }: { canEdit: boolean }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['config-synonyms'], queryFn: listSynonyms });
  const [raw, setRaw] = useState('');
  const [canonical, setCanonical] = useState('');
  const [applied, setApplied] = useState<number | null>(null);

  const aliases = useMemo(() => (q.data ?? []).filter((r) => r.kind === 'model_value'), [q.data]);

  const add = useMutation({
    mutationFn: (row: Omit<SynonymRow, 'id'>) => addSynonym(row),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config-synonyms'] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteSynonym(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config-synonyms'] }),
  });
  const apply = useMutation({
    mutationFn: () => applyModelAliases(),
    onSuccess: (n) => setApplied(n),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const s = raw.trim();
    const c = canonical.trim();
    if (!s || !c) return;
    add.mutate(
      { canonical_field: 'model', synonym: s.toLowerCase(), kind: 'model_value', maps_to: c },
      { onSuccess: () => { setRaw(''); setCanonical(''); } },
    );
  }

  return (
    <Panel
      title={t('Model aliases')}
      action={
        canEdit ? (
          <Button size="sm" variant="outline" disabled={apply.isPending || aliases.length === 0} onClick={() => apply.mutate()}>
            <Wand2 className="h-3.5 w-3.5" strokeWidth={2} />
            {apply.isPending ? t('Applying…') : t('Apply to catalog')}
          </Button>
        ) : undefined
      }
    >
      <p className="mb-4 text-sm text-muted-foreground">
        {t('Unify how the same phone is named across suppliers — map a raw name')} (<span className="font-mono">IP15</span>, <span className="font-mono">Apple iPhone 15</span>) {t('to one canonical model')} (<span className="font-mono">iPhone 15</span>), {t('so you never get two listings of the same model. New imports fold automatically;')}
        <b className="text-foreground"> {t('Apply to catalog')}</b> {t('re-names existing products now.')}
      </p>

      {canEdit && (
        <form onSubmit={submit} className="mb-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label={t('Raw / supplier name')}>
            <TextInput value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="IP15" className="h-10" />
          </Field>
          <Field label={t('Canonical model')}>
            <TextInput value={canonical} onChange={(e) => setCanonical(e.target.value)} placeholder="iPhone 15" className="h-10" />
          </Field>
          <Button type="submit" size="sm" disabled={add.isPending || !raw.trim() || !canonical.trim()}>{t('Add alias')}</Button>
        </form>
      )}
      <MutationError error={add.error ?? remove.error ?? apply.error} />
      {applied !== null && (
        <p className="mb-3 text-sm text-success">{t('Renamed')} {applied} {applied === 1 ? t('product') : t('products')} {t('to their canonical model.')}</p>
      )}

      {q.isLoading && <p className="text-sm text-muted-foreground">{t('Loading aliases…')}</p>}
      {q.data && aliases.length === 0 && <p className="text-sm text-muted-foreground">{t('No aliases yet. Add one above when a supplier names a model differently.')}</p>}
      {aliases.length > 0 && (
        <Table
          minWidth={480}
          columns={[
            { key: 'raw', label: t('Raw / alias') },
            { key: 'canonical', label: t('Canonical model') },
            { key: 'action', label: '', align: 'right' },
          ]}
        >
          {aliases.map((r) => (
            <tr key={r.id} className="hover:bg-muted/40">
              <Td className="font-mono text-xs">{r.synonym}</Td>
              <Td className="font-medium">{r.maps_to ?? '—'}</Td>
              <Td align="right">
                {canEdit && (
                  <button type="button" aria-label={`${t('Delete alias')} ${r.synonym}`} onClick={() => remove.mutate(r.id)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </Panel>
  );
}

function ProfileSection() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['config-import-profiles'], queryFn: listImportProfiles });
  const remove = useMutation({
    mutationFn: (id: string) => deleteImportProfile(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config-import-profiles'] }),
  });

  return (
    <Panel title={t('Saved import profiles')}>
      <p className="mb-4 text-sm text-muted-foreground">
        {t('Column maps remembered per supplier + header layout, so a returning file auto-maps zero-click. Delete a stale profile to force a fresh mapping next time.')}
      </p>
      {q.isLoading && <p className="text-sm text-muted-foreground">{t('Loading profiles…')}</p>}
      {q.data && q.data.length === 0 && <p className="text-sm text-muted-foreground">{t('No saved profiles yet.')}</p>}
      <MutationError error={remove.error} />
      {q.data && q.data.length > 0 && (
        <Table
          minWidth={640}
          columns={[
            { key: 'supplier', label: t('Supplier') },
            { key: 'sheet', label: t('Sheet') },
            { key: 'v', label: t('Version'), align: 'right' },
            { key: 'updated', label: t('Updated') },
            { key: 'action', label: '', align: 'right' },
          ]}
        >
          {q.data.map((r: ImportProfileRow) => (
            <tr key={r.id} className="hover:bg-muted/40">
              <Td className="font-medium">{r.supplier?.name ?? r.supplier_id.slice(0, 8)}</Td>
              <Td className="text-muted-foreground">{r.sheet_name ?? '—'}{r.header_row != null ? ` · ${t('row')} ${r.header_row}` : ''}</Td>
              <Td align="right" className="font-mono tabular-nums">{r.version}</Td>
              <Td className="text-muted-foreground">{new Date(r.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Td>
              <Td align="right">
                <button type="button" aria-label={t('Delete profile')} onClick={() => remove.mutate(r.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </Panel>
  );
}

export default function ImportDictTab() {
  const { role } = useAuth();
  return (
    <div className="space-y-6">
      <AdminOnlyNote show={role !== 'admin'} />
      <ModelAliasSection canEdit={role === 'admin'} />
      <SynonymSection canEdit={role === 'admin'} />
      <ProfileSection />
    </div>
  );
}
