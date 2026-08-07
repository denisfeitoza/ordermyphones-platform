import type { DetectedSheet } from '@/lib/import/parse';
import type { CanonicalField, MapResult } from '@/lib/import/map';
import type { ImportMode } from '@/lib/import/commit';
import type { CommitStockImportResult, ValidatedRow } from '@/lib/import/types';

export type WizardStepId = 'upload' | 'map' | 'dryrun' | 'commit';

export const WIZARD_STEPS: Array<{ id: WizardStepId; label: string }> = [
  { id: 'upload', label: 'Upload' },
  { id: 'map', label: 'Map columns' },
  { id: 'dryrun', label: 'Dry run' },
  { id: 'commit', label: 'Commit' },
];

export interface SupplierOption {
  id: string;
  anonLabel: string;
  vendorCode: string | null;
}

export interface LocationOption {
  id: string;
  code: string;
  displayName: string;
}

/** Everything the wizard needs from DETECT — set once per file selection. */
export interface DetectedFile {
  fileName: string;
  sheet: DetectedSheet;
  headerFingerprint: string;
}

/** One row in the MAP screen — a projection of the working Map<column, field>, plus enough info to render it. */
export interface ColumnAssignment {
  column: string;
  field: CanonicalField | 'ignore';
  confidence: number;
  layer: MapResult['mappings'][number]['layer'] | 'manual';
  sampleValues: string[];
  needsReview: boolean;
}

export interface DryRunState {
  validated: ValidatedRow[];
  columnMap: Map<string, CanonicalField>;
}

/**
 * commitStockImport only ever receives ACCEPTED rows, so the RPC's own
 * rows_total/rows_rejected reflect the accepted-only batch it was handed —
 * NOT the sheet's real totals, and its reject_reasons is always empty. The
 * commit screen needs the dry-run's true totals/rejects alongside the RPC
 * result, or "Rows in file" / "Rejected" would silently read as 0-rejects
 * even when the dry-run just showed hundreds.
 */
export interface PreCommitInfo {
  rowsInFile: number;
  clientRejects: Array<{ row: number; reason: string }>;
}

export type { ImportMode, CanonicalField, CommitStockImportResult };
