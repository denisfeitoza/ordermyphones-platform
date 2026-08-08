import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { FileSpreadsheet, UploadCloud } from 'lucide-react';
import { Panel } from '@/components/admin/parts';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import type { ImportMode, LocationOption, SupplierOption } from './types';

const ACCEPTED_EXT = ['.xls', '.xlsx', '.csv', '.tsv'];

export function UploadStep({
  file,
  onFile,
  supplierId,
  onSupplierChange,
  suppliers,
  mode,
  onModeChange,
  locationCode,
  onLocationChange,
  locations,
  error,
  busy,
  onContinue,
}: {
  file: File | null;
  onFile: (file: File | null) => void;
  supplierId: string | null;
  onSupplierChange: (id: string | null) => void;
  suppliers: SupplierOption[];
  mode: ImportMode;
  onModeChange: (mode: ImportMode) => void;
  locationCode: string | null;
  onLocationChange: (code: string | null) => void;
  locations: LocationOption[];
  error: string | null;
  busy: boolean;
  onContinue: () => void;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function pickFile(f: File | null | undefined) {
    if (!f) return;
    const ext = `.${f.name.split('.').pop()?.toLowerCase()}`;
    if (!ACCEPTED_EXT.includes(ext)) {
      onFile(null);
      return;
    }
    onFile(f);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    pickFile(e.dataTransfer.files?.[0]);
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    pickFile(e.target.files?.[0]);
  }

  const canContinue = !!file && !!supplierId && (mode !== 'replace_location' || !!locationCode) && !busy;

  return (
    <div className="space-y-4">
      <Panel title={t('1. File')}>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
          }}
          className={cn(
            'flex min-h-[140px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors',
            dragOver ? 'border-brand bg-brand/5' : 'border-border hover:border-foreground/30',
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_EXT.join(',')}
            className="sr-only"
            onChange={handleInputChange}
            aria-label={t('Stock file')}
          />
          {file ? (
            <>
              <FileSpreadsheet className="h-8 w-8 text-brand" strokeWidth={1.5} />
              <p className="text-sm font-medium">{file.name}</p>
              <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB · {t('click or drop to replace')}</p>
            </>
          ) : (
            <>
              <UploadCloud className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
              <p className="text-sm font-medium">{t('Drop a stock file here, or click to browse')}</p>
              <p className="text-xs text-muted-foreground">.xls, .xlsx, .csv, .tsv</p>
            </>
          )}
        </div>
      </Panel>

      <Panel title={t('2. Supplier & mode')}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{t('Supplier')}</span>
            <select
              value={supplierId ?? ''}
              onChange={(e) => onSupplierChange(e.target.value || null)}
              className="h-11 rounded-xl border border-border bg-background px-3.5 text-sm outline-none transition-colors focus:border-brand"
            >
              <option value="" disabled>
                {t('Select supplier…')}
              </option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id} disabled={!s.vendorCode}>
                  {s.anonLabel}
                  {!s.vendorCode ? ` (${t('no vendor code — cannot import')})` : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{t('Mode')}</span>
            <select
              value={mode}
              onChange={(e) => onModeChange(e.target.value as ImportMode)}
              className="h-11 rounded-xl border border-border bg-background px-3.5 text-sm outline-none transition-colors focus:border-brand"
            >
              <option value="merge">{t('Merge (only rows in the sheet change)')}</option>
              <option value="replace_location">{t('Replace location (zero balance first)')}</option>
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">
              {t('Target location')}
              {mode === 'replace_location' && <span className="text-destructive"> *</span>}
            </span>
            <select
              value={locationCode ?? ''}
              onChange={(e) => onLocationChange(e.target.value || null)}
              className="h-11 rounded-xl border border-border bg-background px-3.5 text-sm outline-none transition-colors focus:border-brand"
            >
              <option value="">
                {mode === 'replace_location' ? t('Select location…') : t('Only if the file has no location column')}
              </option>
              {locations.map((l) => (
                <option key={l.id} value={l.code}>
                  {l.displayName} ({l.code})
                </option>
              ))}
            </select>
          </label>
        </div>
        {mode === 'replace_location' && (
          <p className="mt-3 text-xs text-muted-foreground">
            {t('Every existing balance at the chosen location that is not present in this sheet will be zeroed — recorded as an audited stock movement, not deleted history.')}
          </p>
        )}
      </Panel>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>
      )}

      <div className="flex justify-end">
        <Button onClick={onContinue} disabled={!canContinue}>
          {busy ? t('Reading file…') : t('Continue')}
        </Button>
      </div>
    </div>
  );
}
