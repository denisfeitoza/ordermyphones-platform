import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { createStockLocation, upsertVendorGrade, type StockLocationRow } from '@/data/adminConfig';
import { CTIA_GRADES, type CtiaGrade } from '@/lib/pricingSettings';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

/**
 * "+ New …" forms that open right under a dropdown, so an admin never leaves
 * the screen to add a missing grade, location or capacity. Grades and
 * locations are admin-only writes (RLS on vendor_grade_map / stock_locations);
 * callers show the "+ New …" option only to admins.
 */

/** Select value that opens the inline "create new" form instead of picking an option. */
export const NEW_OPTION = '__new__';

const inputCls = 'h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-brand';

/** Standard storage sizes, smallest to largest. */
export const STANDARD_CAPACITIES = ['8GB', '16GB', '32GB', '64GB', '128GB', '256GB', '512GB', '1TB', '2TB', '4TB'] as const;

/** "64 gb" / "64 GB" → "64GB", the spelling the catalog uses (SKUs embed it). */
export const normalizeCapacity = (s: string) =>
  s.trim().replace(/^(\d+(?:\.\d+)?)\s*(gb|tb|mb)$/i, (_m, n: string, u: string) => `${n}${u.toUpperCase()}`);

/** Sort key for a capacity: size in MB when it reads as a size, else last. */
function capacityMb(c: string): number {
  const m = /^(\d+(?:\.\d+)?)(MB|GB|TB)$/.exec(c);
  if (!m) return Number.MAX_SAFE_INTEGER;
  const n = Number(m[1]);
  return m[2] === 'TB' ? n * 1024 * 1024 : m[2] === 'GB' ? n * 1024 : n;
}

/** The standard sizes plus any extra values already in use, deduped and sorted by size. */
export function capacityOptions(extra: readonly string[]): string[] {
  const all = new Set<string>(STANDARD_CAPACITIES);
  for (const c of extra) {
    const n = normalizeCapacity(c);
    if (n) all.add(n);
  }
  return [...all].sort((a, b) => capacityMb(a) - capacityMb(b) || a.localeCompare(b));
}

/** Location code from its name: "Miami 2" → "MIAMI-2" (stock_locations.code is unique). */
export const locationCode = (name: string) =>
  name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 16);

function Actions({ label, busy, disabled, onSave, onCancel }: { label: string; busy: boolean; disabled: boolean; onSave: () => void; onCancel: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex gap-2">
      <Button type="button" size="sm" variant="primary" className="min-h-11 sm:min-h-0" disabled={disabled || busy} onClick={onSave}>
        {busy ? t('Saving…') : label}
      </Button>
      <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-0" onClick={onCancel} disabled={busy}>
        {t('Cancel')}
      </Button>
    </div>
  );
}

/** New stock location (name → code). Refreshes every location list on success. */
export function NewLocationForm({ onCreated, onCancel }: { onCreated: (row: StockLocationRow) => void; onCancel: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const code = locationCode(name);
  const add = useMutation({
    mutationFn: () => createStockLocation({ code, display_name: name.trim(), region: null }),
    onSuccess: async (row) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['active-locations'] }),
        qc.invalidateQueries({ queryKey: ['admin-import-locations'] }),
      ]);
      void qc.invalidateQueries({ queryKey: ['config-locations'] });
      onCreated(row);
    },
  });
  return (
    <div className="mt-2 space-y-2 rounded-xl bg-muted/40 p-3">
      <p className="text-xs font-medium">{t('New location')}</p>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Miami" maxLength={60} autoFocus aria-label={t('Location name')} className={inputCls} />
      {code && (
        <p className="text-xs text-muted-foreground">
          {t('Code')}: <span className="font-mono">{code}</span> · {t('Add its address later in Inventory → Locations.')}
        </p>
      )}
      {add.isError && <p className="text-xs text-destructive">{add.error.message}</p>}
      <Actions label={t('Add location')} busy={add.isPending} disabled={!code} onSave={() => add.mutate()} onCancel={onCancel} />
    </div>
  );
}

/** New grade label mapped to a CTIA grade (vendor_grade_map, vendor 'OMP'). */
export function NewGradeForm({ known, onCreated, onCancel }: { known: readonly string[]; onCreated: (grade: string) => void; onCancel: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [ctia, setCtia] = useState<CtiaGrade>('A');
  const clean = name.trim();
  const taken = known.some((g) => g.toUpperCase() === clean.toUpperCase());
  const add = useMutation({
    mutationFn: () => upsertVendorGrade({ vendor_code: 'OMP', vendor_grade: clean, ctia }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['known-grades'] });
      void qc.invalidateQueries({ queryKey: ['config-grade-map'] });
      onCreated(clean);
    },
  });
  return (
    <div className="mt-2 space-y-2 rounded-xl bg-muted/40 p-3">
      <p className="text-xs font-medium">{t('New grade')}</p>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="DLS A+" maxLength={30} autoFocus aria-label={t('Grade name')} className={inputCls} />
        <select value={ctia} onChange={(e) => setCtia(e.target.value as CtiaGrade)} aria-label={t('CTIA grade')} className={cn(inputCls, 'w-28')}>
          {CTIA_GRADES.map((c) => (
            <option key={c} value={c}>
              CTIA {c}
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs text-muted-foreground">{t('The CTIA grade decides how customers see this grade and how it is priced.')}</p>
      {taken && <p className="text-xs text-destructive">{t('This grade already exists. Pick it from the list.')}</p>}
      {add.isError && <p className="text-xs text-destructive">{add.error.message}</p>}
      <Actions label={t('Add grade')} busy={add.isPending} disabled={!clean || taken} onSave={() => add.mutate()} onCancel={onCancel} />
    </div>
  );
}

/** New capacity: nothing to store until the product is saved — it only needs the standard spelling. */
export function NewCapacityForm({ onCreated, onCancel }: { onCreated: (capacity: string) => void; onCancel: () => void }) {
  const { t } = useI18n();
  const [value, setValue] = useState('');
  const clean = normalizeCapacity(value);
  return (
    <div className="mt-2 space-y-2 rounded-xl bg-muted/40 p-3">
      <p className="text-xs font-medium">{t('New capacity')}</p>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="24GB"
        maxLength={20}
        autoFocus
        aria-label={t('Capacity')}
        className={inputCls}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (clean) onCreated(clean);
          }
        }}
      />
      {clean && clean !== value.trim() && (
        <p className="text-xs text-muted-foreground">
          {t('Saved as')} <span className="font-mono">{clean}</span>
        </p>
      )}
      <Actions label={t('Use this capacity')} busy={false} disabled={!clean} onSave={() => onCreated(clean)} onCancel={onCancel} />
    </div>
  );
}
