import { supabase } from '@/lib/supabase';
import type { DbTier } from '@/lib/invites';
import type { CtiaGrade } from '@/lib/pricingSettings';

/**
 * Data layer for the Admin Configuration area (Phase 7). Reads/writes the
 * config tables directly via PostgREST where RLS already permits an
 * admin/staff write (tiers, pricing_settings, stock_locations, vendor_grade_map,
 * import_synonyms, import_profiles, app_settings, grade_classification_queue),
 * and calls the SECURITY DEFINER RPCs (20260807210000_admin_config.sql) for the
 * sensitive/engine-touching actions (reprice_all, merge_locations,
 * set_customer_tier, set_user_role, resolve_grade_classification, view-as reads).
 *
 * Write-role reference (from the migrations' RLS): admin-only → tiers,
 * pricing_settings, vendor_grade_map, import_synonyms; staff-ok →
 * stock_locations, app_settings, grade_classification_queue, import_profiles.
 * The UI disables inputs for the wrong role rather than letting a write die on
 * an RLS error.
 */

export type AppRoleName = 'admin' | 'staff' | 'customer';

// ---------- app_settings (generic key/value) ----------

export async function getAppSetting<T>(key: string, fallback: T): Promise<T> {
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return fallback;
  return data.value as T;
}

export async function setAppSetting(key: string, value: unknown): Promise<void> {
  const { error } = await supabase.from('app_settings').upsert({ key, value }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
}

// ---------- pricing_settings ----------

export interface PricingSettingRow {
  key: string;
  value: unknown;
  updated_at: string;
}

export async function listPricingSettings(): Promise<PricingSettingRow[]> {
  const { data, error } = await supabase.from('pricing_settings').select('key,value,updated_at').order('key');
  if (error) throw new Error(error.message);
  return (data ?? []) as PricingSettingRow[];
}

export async function setPricingSetting(key: string, value: unknown): Promise<void> {
  const { error } = await supabase.from('pricing_settings').upsert({ key, value }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
}

// ---------- tiers (DB customer_tier) ----------

export interface DbTierRow {
  code: DbTier;
  label: string;
  min_units: number;
  max_units: number | null;
  floor_cents: number;
  position: number;
}

export async function listTiers(): Promise<DbTierRow[]> {
  const { data, error } = await supabase.from('tiers').select('code,label,min_units,max_units,floor_cents,position').order('position');
  if (error) throw new Error(error.message);
  return (data ?? []) as DbTierRow[];
}

export async function updateTier(code: DbTier, patch: Partial<Omit<DbTierRow, 'code' | 'position'>>): Promise<void> {
  const { error } = await supabase.from('tiers').update(patch).eq('code', code);
  if (error) throw new Error(error.message);
}

export async function repriceAll(): Promise<number> {
  const { data, error } = await supabase.rpc('reprice_all');
  if (error) throw new Error(error.message);
  return (data as number) ?? 0;
}

// ---------- stock_locations ----------

export interface StockLocationRow {
  id: string;
  code: string;
  display_name: string;
  region: string | null;
  active: boolean;
}

export async function listStockLocations(): Promise<StockLocationRow[]> {
  const { data, error } = await supabase.from('stock_locations').select('id,code,display_name,region,active').order('code');
  if (error) throw new Error(error.message);
  return (data ?? []) as StockLocationRow[];
}

export async function updateStockLocation(id: string, patch: Partial<Pick<StockLocationRow, 'display_name' | 'region' | 'active'>>): Promise<void> {
  const { error } = await supabase.from('stock_locations').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export interface CreateStockLocationInput {
  code: string;
  display_name: string;
  region?: string | null;
}

/** Create a new warehouse/location. Plain INSERT — RLS ('staff write=ALL')
 * authorizes admin/staff. `code` is unique; a duplicate surfaces as a friendly
 * message instead of the raw Postgres 23505. */
export async function createStockLocation(input: CreateStockLocationInput): Promise<StockLocationRow> {
  const { data, error } = await supabase
    .from('stock_locations')
    .insert({ code: input.code, display_name: input.display_name, region: input.region ?? null })
    .select('id,code,display_name,region,active')
    .single();
  if (error) {
    if (error.code === '23505') throw new Error(`A location with code "${input.code}" already exists.`);
    throw new Error(error.message);
  }
  return data as StockLocationRow;
}

/** Hard-delete a location — only succeeds when it has never held stock (no
 * inventory, no ledger movements); otherwise the guarded RPC raises and the
 * admin must deactivate or merge instead. Admin-only. */
export async function deleteStockLocation(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_stock_location', { p_id: id });
  if (error) {
    if (error.message.includes('location_has_history')) {
      throw new Error('This location has stock or history — deactivate or merge it instead of deleting.');
    }
    throw new Error(error.message);
  }
}

export interface MergeResult {
  from_code: string;
  to_code: string;
  variants_moved: number;
  units_moved: number;
  source_deactivated: boolean;
}

export async function mergeLocations(fromCode: string, toCode: string): Promise<MergeResult> {
  const { data, error } = await supabase.rpc('merge_locations', { p_from_code: fromCode, p_to_code: toCode });
  if (error) throw new Error(error.message);
  return data as MergeResult;
}

// ---------- vendor_grade_map + grade_classification_queue ----------

export interface VendorGradeRow {
  id: string;
  vendor_code: string;
  vendor_grade: string;
  ctia: CtiaGrade;
}

export async function listVendorGradeMap(): Promise<VendorGradeRow[]> {
  const { data, error } = await supabase.from('vendor_grade_map').select('id,vendor_code,vendor_grade,ctia').order('vendor_code').order('vendor_grade');
  if (error) throw new Error(error.message);
  return (data ?? []) as VendorGradeRow[];
}

export async function upsertVendorGrade(row: { vendor_code: string; vendor_grade: string; ctia: CtiaGrade }): Promise<void> {
  const { error } = await supabase.from('vendor_grade_map').upsert(row, { onConflict: 'vendor_code,vendor_grade' });
  if (error) throw new Error(error.message);
}

export async function deleteVendorGrade(id: string): Promise<void> {
  const { error } = await supabase.from('vendor_grade_map').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export interface GradeQueueRow {
  id: string;
  vendor_code: string;
  vendor_grade: string;
  occurrences: number;
  status: 'pending' | 'classified' | 'ignored';
  first_seen_at: string;
  resolved_ctia: CtiaGrade | null;
}

export async function listGradeQueue(): Promise<GradeQueueRow[]> {
  const { data, error } = await supabase
    .from('grade_classification_queue')
    .select('id,vendor_code,vendor_grade,occurrences,status,first_seen_at,resolved_ctia')
    .order('status')
    .order('occurrences', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as GradeQueueRow[];
}

export async function resolveGradeClassification(queueId: string, ctia: CtiaGrade): Promise<{ variants_repriced: number }> {
  const { data, error } = await supabase.rpc('resolve_grade_classification', { p_queue_id: queueId, p_ctia: ctia });
  if (error) throw new Error(error.message);
  return data as { variants_repriced: number };
}

export async function ignoreGradeQueueRow(id: string): Promise<void> {
  const { error } = await supabase.from('grade_classification_queue').update({ status: 'ignored' }).eq('id', id);
  if (error) throw new Error(error.message);
}

// ---------- import_synonyms ----------

export interface SynonymRow {
  id: string;
  canonical_field: string;
  synonym: string;
  kind: 'header' | 'carrier_value' | 'model_value';
  maps_to: string | null;
}

export async function listSynonyms(): Promise<SynonymRow[]> {
  const { data, error } = await supabase.from('import_synonyms').select('id,canonical_field,synonym,kind,maps_to').order('canonical_field').order('synonym');
  if (error) throw new Error(error.message);
  return (data ?? []) as SynonymRow[];
}

/** Re-canonicalize existing products through the model-alias dictionary. Returns
 * how many product names changed. */
export async function applyModelAliases(): Promise<number> {
  const { data, error } = await supabase.rpc('apply_model_aliases');
  if (error) throw new Error(error.message);
  return (data as number) ?? 0;
}

export async function addSynonym(row: Omit<SynonymRow, 'id'>): Promise<void> {
  const { error } = await supabase.from('import_synonyms').insert(row);
  if (error) throw new Error(error.message);
}

export async function deleteSynonym(id: string): Promise<void> {
  const { error } = await supabase.from('import_synonyms').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ---------- import_profiles ----------

export interface ImportProfileRow {
  id: string;
  supplier_id: string;
  header_fingerprint: string;
  sheet_name: string | null;
  header_row: number | null;
  version: number;
  updated_at: string;
  supplier: { name: string } | null;
}

export async function listImportProfiles(): Promise<ImportProfileRow[]> {
  const { data, error } = await supabase
    .from('import_profiles')
    .select('id,supplier_id,header_fingerprint,sheet_name,header_row,version,updated_at,supplier:suppliers(name)')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as ImportProfileRow[]);
}

export async function deleteImportProfile(id: string): Promise<void> {
  const { error } = await supabase.from('import_profiles').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ---------- users (profiles) + sensitive RPCs ----------

export interface ProfileRow {
  id: string;
  email: string;
  role: AppRoleName;
  tier: DbTier | null;
  is_test: boolean;
  display_name: string | null;
  created_at: string;
}

export interface AccessRequestRow {
  id: string;
  full_name: string;
  business_name: string | null;
  email: string;
  phone: string | null;
  tier_interest: string | null;
  note: string | null;
  status: string;
  created_at: string;
}

export async function listAccessRequests(): Promise<AccessRequestRow[]> {
  const { data, error } = await supabase
    .from('access_requests')
    .select('id,full_name,business_name,email,phone,tier_interest,note,status,created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as AccessRequestRow[];
}

export async function setAccessRequestStatus(id: string, status: 'invited' | 'dismissed'): Promise<void> {
  const { error } = await supabase.rpc('set_access_request_status', { p_id: id, p_status: status });
  if (error) throw new Error(error.message);
}

export async function listProfiles(): Promise<ProfileRow[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id,email,role,tier,is_test,display_name,created_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ProfileRow[];
}

export async function setCustomerTier(userId: string, tier: DbTier, reason: string | null): Promise<void> {
  const { error } = await supabase.rpc('set_customer_tier', { p_user_id: userId, p_tier: tier, p_reason: reason });
  if (error) throw new Error(error.message);
}

export async function setUserRole(userId: string, role: AppRoleName): Promise<void> {
  const { error } = await supabase.rpc('set_user_role', { p_user_id: userId, p_role: role });
  if (error) throw new Error(error.message);
}

// ---------- view-as lens (admin read RPCs) ----------

export interface ViewAsProfile {
  id: string;
  email: string;
  role: AppRoleName;
  tier: DbTier | null;
  is_test: boolean;
  display_name: string | null;
  phone: string | null;
  locale: string;
  created_at: string;
}

export interface ViewAsOrderItem {
  sku: string;
  make: string;
  model: string;
  capacity: string | null;
  color: string | null;
  qty_requested: number;
  qty_approved: number | null;
  unit_price_cents: number;
  tier: DbTier;
}

export interface ViewAsOrder {
  id: string;
  status: string;
  tier_at_order: DbTier;
  subtotal_cents: number;
  placed_at: string;
  decided_at: string | null;
  notes: string | null;
  is_test: boolean;
  item_count: number;
  items: ViewAsOrderItem[];
}

export async function adminGetCustomerProfile(userId: string): Promise<ViewAsProfile | null> {
  const { data, error } = await supabase.rpc('admin_get_customer_profile', { p_user_id: userId });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return (row as ViewAsProfile | undefined) ?? null;
}

export async function adminGetCustomerOrders(userId: string): Promise<ViewAsOrder[]> {
  const { data, error } = await supabase.rpc('admin_get_customer_orders', { p_user_id: userId });
  if (error) throw new Error(error.message);
  return (data as ViewAsOrder[]) ?? [];
}

export async function logViewAs(userId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_log_view_as', { p_user_id: userId });
  if (error) throw new Error(error.message);
}

// ---------- admin_audit (admin read only) ----------

export interface AdminAuditRow {
  id: string;
  actor_id: string | null;
  action: string;
  target_user_id: string | null;
  detail: Record<string, unknown>;
  created_at: string;
  actor: { email: string } | null;
  target: { email: string } | null;
}

export async function listAdminAudit(limit = 100): Promise<AdminAuditRow[]> {
  const { data, error } = await supabase
    .from('admin_audit')
    .select('id,actor_id,action,target_user_id,detail,created_at,actor:profiles!admin_audit_actor_id_fkey(email),target:profiles!admin_audit_target_user_id_fkey(email)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as AdminAuditRow[];
}
