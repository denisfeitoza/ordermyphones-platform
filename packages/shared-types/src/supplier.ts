export type SupplierCode = 'source-1' | 'source-2';

export type SupplierKind = 'dropship' | 'wholesale';

export interface InventorySnapshot {
  id: string;
  variantId: string;
  supplierId: string;
  availableQty: number; // >= 0
  unitCostCents: number;
  currency: 'USD';
  asOf: string; // ISO 8601
}

export type SyncRunKind = 'catalog' | 'inventory' | 'prices';

export type SyncRunStatus = 'running' | 'success' | 'failed' | 'partial';

export interface SupplierSyncRun {
  id: string;
  supplierId: string;
  kind: SyncRunKind;
  startedAt: string;
  endedAt: string | null;
  rowsSeen: number;
  rowsUpserted: number;
  rowsFailed: number;
  status: SyncRunStatus;
  errorSummary: string | null;
}
