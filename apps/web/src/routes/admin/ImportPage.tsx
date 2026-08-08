import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { AdminHeading } from '@/components/admin/parts';
import { useI18n } from '@/i18n';
import { detectImportFile, HEADER_CONFIDENCE_THRESHOLD, type DetectedSheet } from '@/lib/import/parse';
import { mapColumns, CONFIDENCE_THRESHOLD, type CanonicalField } from '@/lib/import/map';
import { projectRow } from '@/lib/import/normalize';
import { validateRows } from '@/lib/import/validate';
import { commitStockImport, computeHeaderFingerprint } from '@/lib/import/commit';
import { fetchImportProfile, applyProfileColumnMap, saveImportProfile } from '@/lib/import/profile';
import { CARRIER_CODES, type CarrierCode, type CommitStockImportResult } from '@/lib/import/types';
import type { ImportMode } from '@/lib/import/commit';
import { Stepper } from '@/components/admin/import/Stepper';
import { UploadStep } from '@/components/admin/import/UploadStep';
import { MapStep } from '@/components/admin/import/MapStep';
import { DryRunStep } from '@/components/admin/import/DryRunStep';
import { CommitStep } from '@/components/admin/import/CommitStep';
import type { ColumnAssignment, DetectedFile, DryRunState, LocationOption, PreCommitInfo, SupplierOption, WizardStepId } from '@/components/admin/import/types';

/** D16: source_label is a file BASENAME only, never a full path. File.name from a real <input type=file> is already a basename, but this strips defensively in case a future caller passes a path-shaped string. */
function basename(name: string): string {
  return name.split(/[\\/]/).pop() || name;
}

async function fetchSuppliers(): Promise<SupplierOption[]> {
  const { data, error } = await supabase.from('suppliers').select('id, anon_label, vendor_code').eq('active', true).order('anon_label');
  if (error) throw error;
  return (data ?? []).map((s) => ({ id: s.id as string, anonLabel: s.anon_label as string, vendorCode: (s.vendor_code as string | null) ?? null }));
}

async function fetchLocations(): Promise<LocationOption[]> {
  const { data, error } = await supabase.from('stock_locations').select('id, code, display_name').eq('active', true).order('display_name');
  if (error) throw error;
  return (data ?? []).map((l) => ({ id: l.id as string, code: l.code as string, displayName: l.display_name as string }));
}

const CARRIER_CODE_SET = new Set<string>(CARRIER_CODES);

async function fetchCarrierSynonyms(): Promise<Map<string, CarrierCode>> {
  const { data, error } = await supabase.from('import_synonyms').select('synonym, maps_to').eq('kind', 'carrier_value');
  if (error) throw error;
  const m = new Map<string, CarrierCode>();
  for (const row of data ?? []) {
    // maps_to is free-form text (admin-editable dictionary) — only trust
    // values that are actually one of the nine canonical carrier codes, so
    // an admin typo can't silently forge a bogus code into the dry-run
    // preview (the server's own omp_fold_carrier is unaffected either way).
    const code = row.maps_to ? String(row.maps_to).trim().toUpperCase() : null;
    if (code && CARRIER_CODE_SET.has(code)) m.set(String(row.synonym).trim().toUpperCase(), code as CarrierCode);
  }
  return m;
}

async function fetchKnownGrades(vendorCode: string): Promise<Set<string>> {
  const { data, error } = await supabase.from('vendor_grade_map').select('vendor_grade').eq('vendor_code', vendorCode);
  if (error) throw error;
  return new Set((data ?? []).map((r) => String(r.vendor_grade).trim().toUpperCase()));
}

function sampleForColumn(rows: Record<string, unknown>[], col: string): string[] {
  const seen: string[] = [];
  for (const r of rows) {
    const v = r[col];
    if (v !== null && v !== undefined && String(v).trim() !== '') {
      const s = String(v).trim();
      if (!seen.includes(s)) seen.push(s);
    }
    if (seen.length >= 3) break;
  }
  return seen;
}

function buildAssignments(sheet: DetectedSheet, mapResult: Awaited<ReturnType<typeof mapColumns>>): ColumnAssignment[] {
  const byColumn = new Map(mapResult.mappings.map((m) => [m.column, m]));
  return sheet.headers.map((column) => {
    const m = byColumn.get(column);
    const sampleValues = sampleForColumn(sheet.rows, column);
    if (!m) return { column, field: 'ignore' as const, confidence: 0, layer: 'manual' as const, sampleValues, needsReview: false };
    return { column, field: m.field, confidence: m.confidence, layer: m.layer, sampleValues, needsReview: m.confidence < CONFIDENCE_THRESHOLD };
  });
}

const INITIAL_MODE: ImportMode = 'merge';

export default function ImportPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const suppliersQuery = useQuery({ queryKey: ['admin-import-suppliers'], queryFn: fetchSuppliers });
  const locationsQuery = useQuery({ queryKey: ['admin-import-locations'], queryFn: fetchLocations });

  const [step, setStep] = useState<WizardStepId>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [mode, setMode] = useState<ImportMode>(INITIAL_MODE);
  const [locationCode, setLocationCode] = useState<string | null>(null);
  const [detected, setDetected] = useState<DetectedFile | null>(null);
  const [profileHit, setProfileHit] = useState(false);
  const [assignments, setAssignments] = useState<ColumnAssignment[]>([]);
  const [dryRun, setDryRun] = useState<DryRunState | null>(null);
  const [commitResult, setCommitResult] = useState<CommitStockImportResult | null>(null);
  const [preCommitInfo, setPreCommitInfo] = useState<PreCommitInfo | null>(null);
  const [profileSaveWarning, setProfileSaveWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suppliers = suppliersQuery.data ?? [];
  const locations = locationsQuery.data ?? [];

  function resetAll() {
    setStep('upload');
    setFile(null);
    setSupplierId(null);
    setMode(INITIAL_MODE);
    setLocationCode(null);
    setDetected(null);
    setProfileHit(false);
    setAssignments([]);
    setDryRun(null);
    setCommitResult(null);
    setPreCommitInfo(null);
    setProfileSaveWarning(null);
    setError(null);
  }

  function handleFile(f: File | null) {
    setFile(f);
    setError(null);
    setDetected(null);
    setDryRun(null);
  }

  async function runDryRun(columnMap: Map<string, CanonicalField>, sheet: DetectedSheet, targetLocationCode: string | null) {
    const supplier = suppliers.find((s) => s.id === supplierId);
    const warehouseMapped = Array.from(columnMap.values()).includes('warehouse');

    const [carrierSynonyms, knownGrades] = await Promise.all([
      fetchCarrierSynonyms(),
      supplier?.vendorCode ? fetchKnownGrades(supplier.vendorCode) : Promise.resolve(new Set<string>()),
    ]);

    const raws = sheet.rows.map((r) => {
      const raw = projectRow(r, columnMap);
      if (!warehouseMapped && targetLocationCode) raw.warehouseCode = targetLocationCode;
      return raw;
    });

    const validated = validateRows(raws, { carrierSynonyms, knownGrades });
    setDryRun({ validated, columnMap });
  }

  async function handleContinue() {
    setError(null);
    if (!file || !supplierId) return;
    const supplier = suppliers.find((s) => s.id === supplierId);
    if (!supplier?.vendorCode) {
      setError(t('Selected supplier has no vendor code configured — cannot import.'));
      return;
    }
    if (mode === 'replace_location' && !locationCode) {
      setError(t('Choose a target location for Replace mode.'));
      return;
    }

    setBusy(true);
    try {
      const bytes = await file.arrayBuffer();
      const detectResult = detectImportFile(bytes);
      if (!detectResult.best || detectResult.best.confidence < HEADER_CONFIDENCE_THRESHOLD) {
        setError(t('Could not confidently detect a header row in this file. Try a cleaner export (one data sheet, headers on row 1).'));
        return;
      }
      const sheet = detectResult.best;
      const headerFingerprint = await computeHeaderFingerprint(sheet.headers);

      const profile = await fetchImportProfile(supplierId, headerFingerprint);

      if (profile) {
        const columnMap = applyProfileColumnMap(profile.columnMap, sheet.headers);
        const warehouseMapped = Array.from(columnMap.values()).includes('warehouse');
        if (!warehouseMapped && !locationCode) {
          setError(t('This file has no location/warehouse column and the saved profile does not cover one — choose a Target location above.'));
          return;
        }
        setDetected({ fileName: basename(file.name), sheet, headerFingerprint });
        setProfileHit(true);
        await runDryRun(columnMap, sheet, locationCode);
        setStep('dryrun');
        return;
      }

      const mapResult = await mapColumns(sheet.headers, sheet.rows);
      const warehouseMapped = mapResult.mappings.some((m) => m.field === 'warehouse');
      if (!warehouseMapped && !locationCode) {
        setError(t('This file has no location/warehouse column — choose a Target location above.'));
        return;
      }
      setDetected({ fileName: basename(file.name), sheet, headerFingerprint });
      setProfileHit(false);
      setAssignments(buildAssignments(sheet, mapResult));
      setStep('map');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Failed to read file.'));
    } finally {
      setBusy(false);
    }
  }

  function handleFieldChange(column: string, field: CanonicalField | 'ignore') {
    setAssignments((prev) =>
      prev.map((a) => {
        if (a.column === column) return { ...a, field, layer: 'manual', needsReview: false };
        if (field !== 'ignore' && a.field === field) return { ...a, field: 'ignore' };
        return a;
      }),
    );
  }

  async function handleConfirmMapping() {
    if (!detected) return;
    const columnMap = new Map<string, CanonicalField>();
    for (const a of assignments) if (a.field !== 'ignore') columnMap.set(a.column, a.field);

    const warehouseMapped = Array.from(columnMap.values()).includes('warehouse');
    if (!warehouseMapped && !locationCode) {
      setError(t('This file has no location/warehouse column — go back and choose a Target location.'));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await runDryRun(columnMap, detected.sheet, locationCode);
      setStep('dryrun');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Failed to run dry run.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleCommit() {
    if (!detected || !dryRun || !supplierId) return;
    const supplier = suppliers.find((s) => s.id === supplierId);
    if (!supplier?.vendorCode) {
      setError(t('Supplier vendor code missing.'));
      return;
    }
    setBusy(true);
    setError(null);
    setProfileSaveWarning(null);
    try {
      const acceptedRows = dryRun.validated.filter((v) => v.accepted).map((v) => v.row);
      // The RPC only ever sees accepted rows, so its own rows_total/rows_rejected
      // describe that accepted-only batch — capture the dry-run's true totals
      // and client-side rejects here, before they're overwritten by a later run.
      const clientRejects = dryRun.validated
        .filter((v) => !v.accepted)
        .map((v) => ({ row: v.row.rowNumber, reason: v.rejectReason ?? 'unknown' }));

      const result = await commitStockImport({
        supplierId,
        vendorCode: supplier.vendorCode,
        mode,
        sourceLabel: detected.fileName,
        headerFingerprint: detected.headerFingerprint,
        rows: acceptedRows,
        ...(mode === 'replace_location' && locationCode ? { locationCode } : {}),
      });

      // The import already committed at this point — a failure saving the
      // mapping profile is a non-fatal "remap next time" inconvenience, never
      // a reason to tell the operator the import failed when it didn't.
      try {
        await saveImportProfile({
          supplierId,
          headerFingerprint: detected.headerFingerprint,
          sheetName: detected.sheet.sheetName,
          headerRow: detected.sheet.headerRowIndex,
          columnMap: dryRun.columnMap,
        });
      } catch (profileErr) {
        setProfileSaveWarning(profileErr instanceof Error ? profileErr.message : t('unknown error'));
      }

      queryClient.invalidateQueries({ queryKey: ['admin-inventory'] });
      setCommitResult(result);
      setPreCommitInfo({ rowsInFile: dryRun.validated.length, clientRejects });
      setStep('commit');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Commit failed.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <AdminHeading title="Smart Stock Import" subtitle="Upload a vendor stock sheet — auto-map columns, dry-run, then commit as audited stock movements." />

      <div className="rounded-2xl border border-brand/20 bg-brand/5 px-4 py-3 text-sm text-muted-foreground">
        <b className="text-foreground">{t('Four steps:')}</b>{' '}
        {t('upload the supplier’s sheet, confirm which column is which, review the dry-run, then commit. Nothing touches your stock until the final Commit — the dry-run only previews what would change.')}
      </div>

      <Stepper current={step} />

      {suppliersQuery.isError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {t('Could not load suppliers')}: {suppliersQuery.error instanceof Error ? suppliersQuery.error.message : t('unknown error')}
        </div>
      )}

      {step === 'upload' && (
        <UploadStep
          file={file}
          onFile={handleFile}
          supplierId={supplierId}
          onSupplierChange={setSupplierId}
          suppliers={suppliers}
          mode={mode}
          onModeChange={setMode}
          locationCode={locationCode}
          onLocationChange={setLocationCode}
          locations={locations}
          error={error}
          busy={busy || suppliersQuery.isLoading || locationsQuery.isLoading}
          onContinue={handleContinue}
        />
      )}

      {step !== 'upload' && error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>
      )}

      {step === 'map' && (
        <MapStep assignments={assignments} onFieldChange={handleFieldChange} onConfirm={handleConfirmMapping} onBack={() => setStep('upload')} busy={busy} />
      )}

      {step === 'dryrun' && dryRun && (
        <DryRunStep dryRun={dryRun} onBack={() => setStep(profileHit ? 'upload' : 'map')} onCommit={handleCommit} busy={busy} />
      )}

      {step === 'commit' && commitResult && preCommitInfo && (
        <CommitStep result={commitResult} preCommit={preCommitInfo} profileSaveWarning={profileSaveWarning} onStartNew={resetAll} />
      )}
    </div>
  );
}
