import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import {
  listSynonyms,
  addSynonym,
  deleteSynonym,
  listImportProfiles,
  deleteImportProfile,
  type SynonymRow,
  type ImportProfileRow,
} from '@/data/adminConfig';
import { useAuth } from '@/store';
import { Panel, Table, Td } from '@/components/admin/parts';
import { Button } from '@/components/ui/Button';
import { AdminOnlyNote, Field, MutationError, TextInput } from './parts';

const CANONICAL_FIELDS = [
  'quantity', 'cost', 'carrier', 'warehouse', 'make', 'model', 'model_number', 'capacity', 'color', 'grade', 'lock_status', 'category', 'currency', 'description',
];

function SynonymSection({ canEdit }: { canEdit: boolean }) {
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
    <Panel title="Synonym dictionary">
      <p className="mb-4 text-sm text-muted-foreground">
        Maps raw spreadsheet header tokens (and raw carrier values) to canonical fields so supplier files auto-map. Synonyms are stored lower/trimmed.
      </p>
      {canEdit && (
        <form onSubmit={submit} className="mb-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
          <Field label="Canonical field">
            <select value={field} onChange={(e) => setField(e.target.value)} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand">
              {CANONICAL_FIELDS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </Field>
          <Field label="Synonym token">
            <TextInput value={synonym} onChange={(e) => setSynonym(e.target.value)} placeholder="qty" className="h-10" />
          </Field>
          <Field label="Kind">
            <select value={kind} onChange={(e) => setKind(e.target.value as 'header' | 'carrier_value')} className="h-10 rounded-xl border border-border bg-background px-2 text-sm outline-none focus:border-brand">
              <option value="header">header</option>
              <option value="carrier_value">carrier_value</option>
            </select>
          </Field>
          <Button type="submit" size="sm" disabled={add.isPending || !synonym.trim()}>Add</Button>
          {kind === 'carrier_value' && (
            <Field label="Maps to carrier code">
              <TextInput value={mapsTo} onChange={(e) => setMapsTo(e.target.value)} placeholder="ATT" className="h-10" />
            </Field>
          )}
        </form>
      )}
      <MutationError error={add.error ?? remove.error} />

      <div className="mb-3 max-w-xs">
        <TextInput value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter synonyms…" className="h-10" />
      </div>

      {q.isLoading && <p className="text-sm text-muted-foreground">Loading dictionary…</p>}
      {q.data && rows.length === 0 && <p className="text-sm text-muted-foreground">No matching synonyms.</p>}
      {rows.length > 0 && (
        <Table
          minWidth={640}
          columns={[
            { key: 'field', label: 'Field' },
            { key: 'synonym', label: 'Synonym' },
            { key: 'kind', label: 'Kind' },
            { key: 'maps', label: 'Maps to' },
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
                  <button type="button" aria-label={`Delete synonym ${r.synonym}`} onClick={() => remove.mutate(r.id)} className="text-muted-foreground hover:text-destructive">
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
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['config-import-profiles'], queryFn: listImportProfiles });
  const remove = useMutation({
    mutationFn: (id: string) => deleteImportProfile(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config-import-profiles'] }),
  });

  return (
    <Panel title="Saved import profiles">
      <p className="mb-4 text-sm text-muted-foreground">
        Column maps remembered per supplier + header layout, so a returning file auto-maps zero-click. Delete a stale profile to force a fresh mapping next time.
      </p>
      {q.isLoading && <p className="text-sm text-muted-foreground">Loading profiles…</p>}
      {q.data && q.data.length === 0 && <p className="text-sm text-muted-foreground">No saved profiles yet.</p>}
      <MutationError error={remove.error} />
      {q.data && q.data.length > 0 && (
        <Table
          minWidth={640}
          columns={[
            { key: 'supplier', label: 'Supplier' },
            { key: 'sheet', label: 'Sheet' },
            { key: 'v', label: 'Version', align: 'right' },
            { key: 'updated', label: 'Updated' },
            { key: 'action', label: '', align: 'right' },
          ]}
        >
          {q.data.map((r: ImportProfileRow) => (
            <tr key={r.id} className="hover:bg-muted/40">
              <Td className="font-medium">{r.supplier?.name ?? r.supplier_id.slice(0, 8)}</Td>
              <Td className="text-muted-foreground">{r.sheet_name ?? '—'}{r.header_row != null ? ` · row ${r.header_row}` : ''}</Td>
              <Td align="right" className="font-mono tabular-nums">{r.version}</Td>
              <Td className="text-muted-foreground">{new Date(r.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Td>
              <Td align="right">
                <button type="button" aria-label="Delete profile" onClick={() => remove.mutate(r.id)} className="text-muted-foreground hover:text-destructive">
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
      <SynonymSection canEdit={role === 'admin'} />
      <ProfileSection />
    </div>
  );
}
