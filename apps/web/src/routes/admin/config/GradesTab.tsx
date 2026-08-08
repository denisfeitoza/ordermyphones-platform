import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import {
  listVendorGradeMap,
  upsertVendorGrade,
  deleteVendorGrade,
  listGradeQueue,
  resolveGradeClassification,
  ignoreGradeQueueRow,
  type VendorGradeRow,
  type GradeQueueRow,
} from '@/data/adminConfig';
import { CTIA_GRADES, type CtiaGrade } from '@/lib/pricingSettings';
import { useAuth } from '@/store';
import { Panel, Table, Td } from '@/components/admin/parts';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n';
import { AdminOnlyNote, Field, MutationError, TextInput } from './parts';

function CtiaSelect({ value, onChange, disabled, label }: { value: CtiaGrade; onChange: (v: CtiaGrade) => void; disabled?: boolean; label: string }) {
  return (
    <select
      value={value}
      aria-label={label}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as CtiaGrade)}
      className="h-9 rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-brand disabled:opacity-50"
    >
      {CTIA_GRADES.map((g) => (
        <option key={g} value={g}>
          {g}
        </option>
      ))}
    </select>
  );
}

function QueueSection({ canResolve }: { canResolve: boolean }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['config-grade-queue'], queryFn: listGradeQueue });
  const [picks, setPicks] = useState<Record<string, CtiaGrade>>({});

  const resolve = useMutation({
    mutationFn: ({ id, ctia }: { id: string; ctia: CtiaGrade }) => resolveGradeClassification(id, ctia),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config-grade-queue'] });
      qc.invalidateQueries({ queryKey: ['config-grade-map'] });
    },
  });
  const ignore = useMutation({
    mutationFn: (id: string) => ignoreGradeQueueRow(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config-grade-queue'] }),
  });

  const pending = (q.data ?? []).filter((r) => r.status === 'pending');

  return (
    <Panel title={`${t('Unknown grade queue')}${pending.length ? ` · ${pending.length} ${t('pending')}` : ''}`}>
      <p className="mb-4 text-sm text-muted-foreground">
        {t('Vendor grades the importer has never seen. Classify one to a CTIA grade — that writes the grade map and reprices every affected variant.')}
      </p>
      {q.isLoading && <p className="text-sm text-muted-foreground">{t('Loading queue…')}</p>}
      {q.data && pending.length === 0 && <p className="text-sm text-muted-foreground">{t('Nothing pending — all vendor grades are classified.')}</p>}
      {pending.length > 0 && (
        <Table
          minWidth={640}
          columns={[
            { key: 'vendor', label: t('Vendor') },
            { key: 'grade', label: t('Raw grade') },
            { key: 'seen', label: t('Seen'), align: 'right' },
            { key: 'action', label: t('Classify'), align: 'right' },
          ]}
        >
          {pending.map((r: GradeQueueRow) => (
            <tr key={r.id} className="hover:bg-muted/40">
              <Td className="font-mono text-xs">{r.vendor_code}</Td>
              <Td className="font-medium">{r.vendor_grade}</Td>
              <Td align="right" className="font-mono tabular-nums">{r.occurrences}</Td>
              <Td align="right">
                {canResolve ? (
                  <div className="flex items-center justify-end gap-2">
                    <CtiaSelect label={`${t('CTIA for')} ${r.vendor_grade}`} value={picks[r.id] ?? 'A'} onChange={(v) => setPicks({ ...picks, [r.id]: v })} />
                    <Button size="sm" variant="outline" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: r.id, ctia: picks[r.id] ?? 'A' })}>
                      {t('Set')}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={ignore.isPending} onClick={() => ignore.mutate(r.id)}>
                      {t('Ignore')}
                    </Button>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">{t('Admin-only')}</span>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      )}
      <MutationError error={resolve.error ?? ignore.error} />
      {resolve.isSuccess && <p className="mt-2 text-sm text-success">{t('Classified —')} {resolve.data.variants_repriced} {t('variant(s) repriced.')}</p>}
    </Panel>
  );
}

function MapSection({ canEdit }: { canEdit: boolean }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['config-grade-map'], queryFn: listVendorGradeMap });
  const [vendor, setVendor] = useState('');
  const [grade, setGrade] = useState('');
  const [ctia, setCtia] = useState<CtiaGrade>('A');

  const upsert = useMutation({
    mutationFn: (row: { vendor_code: string; vendor_grade: string; ctia: CtiaGrade }) => upsertVendorGrade(row),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config-grade-map'] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteVendorGrade(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config-grade-map'] }),
  });

  function add(e: FormEvent) {
    e.preventDefault();
    if (!vendor.trim() || !grade.trim()) return;
    upsert.mutate(
      { vendor_code: vendor.trim(), vendor_grade: grade.trim(), ctia },
      {
        onSuccess: () => {
          setVendor('');
          setGrade('');
        },
      },
    );
  }

  return (
    <Panel title={t('Vendor grade map')}>
      <p className="mb-4 text-sm text-muted-foreground">
        {t("Maps a vendor's raw grade label (e.g.")}{' '}<code className="rounded bg-muted px-1">DLS B+</code>{t(') to a CTIA consumer grade. Matched on grade label alone — a new mapping affects every variant with that grade text.')}
      </p>
      {canEdit && (
        <form onSubmit={add} className="mb-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
          <Field label={t('Vendor code')}>
            <TextInput value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="DLS" className="h-10" />
          </Field>
          <Field label={t('Raw grade')}>
            <TextInput value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="B+" className="h-10" />
          </Field>
          <Field label={t('CTIA')}>
            <CtiaSelect label={t('CTIA grade')} value={ctia} onChange={setCtia} />
          </Field>
          <Button type="submit" size="sm" disabled={upsert.isPending || !vendor.trim() || !grade.trim()}>
            {t('Add / update')}
          </Button>
        </form>
      )}
      <MutationError error={upsert.error ?? remove.error} />

      {q.isLoading && <p className="text-sm text-muted-foreground">{t('Loading grade map…')}</p>}
      {q.data && q.data.length === 0 && <p className="text-sm text-muted-foreground">{t('No mappings yet.')}</p>}
      {q.data && q.data.length > 0 && (
        <Table
          minWidth={520}
          columns={[
            { key: 'vendor', label: t('Vendor') },
            { key: 'grade', label: t('Raw grade') },
            { key: 'ctia', label: t('CTIA') },
            { key: 'action', label: '', align: 'right' },
          ]}
        >
          {q.data.map((r: VendorGradeRow) => (
            <tr key={r.id} className="hover:bg-muted/40">
              <Td className="font-mono text-xs">{r.vendor_code}</Td>
              <Td className="font-medium">{r.vendor_grade}</Td>
              <Td>{r.ctia}</Td>
              <Td align="right">
                {canEdit && (
                  <button type="button" aria-label={`${t('Delete')} ${r.vendor_code} ${r.vendor_grade}`} onClick={() => remove.mutate(r.id)} className="text-muted-foreground hover:text-destructive">
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

export default function GradesTab() {
  const { role } = useAuth();
  const canEdit = role === 'admin';
  const { t } = useI18n();
  return (
    <div className="space-y-6">
      <AdminOnlyNote show={!canEdit} />
      <div className="rounded-2xl border border-brand/20 bg-brand/5 px-4 py-3 text-sm text-muted-foreground">
        <b className="text-foreground">{t('What are grades?')}</b>{' '}
        {t('Every supplier describes phone condition in their own words — “B+”, “Grade A”, “DLS B”. Here you map each of those to your one standard scale (NEW, CPO, A–D) so pricing and who-sees-what stay consistent. Example: supplier DLS says “B+” → you file it as B.')}
      </div>
      <QueueSection canResolve={canEdit} />
      <MapSection canEdit={canEdit} />
    </div>
  );
}
