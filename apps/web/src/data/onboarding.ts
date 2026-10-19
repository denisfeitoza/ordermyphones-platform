import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * Onboarding (RFC-001 CX Reg + Master Agreement): business profile, document
 * slots and agreement signature. 20261019113000_onboarding.sql.
 * The field list is PROVISIONAL until OMP sends the CX Reg form; extra
 * answers can go into `extra` without a schema change.
 */

export interface Address {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}
export interface Contact {
  name?: string;
  title?: string;
  email?: string;
  phone?: string;
}
export interface TradeReference {
  company?: string;
  contact?: string;
  phone?: string;
  email?: string;
}

export interface BusinessProfile {
  account_id: string;
  legal_name: string | null;
  dba: string | null;
  entity_type: string | null;
  ein: string | null;
  state_of_incorporation: string | null;
  year_established: number | null;
  website: string | null;
  phone: string | null;
  business_address: Address | null;
  billing_address: Address | null;
  primary_contact: Contact | null;
  ap_contact: Contact | null;
  director: Contact | null;
  resale_cert_number: string | null;
  resale_cert_state: string | null;
  r2_cert_number: string | null;
  duns_number: string | null;
  monthly_volume: string | null;
  carrier_account: { carrier?: string; account_number?: string } | null;
  trade_references: TradeReference[] | null;
  extra: Record<string, unknown>;
  status: 'draft' | 'submitted' | 'approved' | 'changes_requested';
  submitted_at: string | null;
  reviewed_at: string | null;
  review_note: string | null;
}

export const EMPTY_PROFILE = (accountId: string): BusinessProfile => ({
  account_id: accountId,
  legal_name: null,
  dba: null,
  entity_type: null,
  ein: null,
  state_of_incorporation: null,
  year_established: null,
  website: null,
  phone: null,
  business_address: null,
  billing_address: null,
  primary_contact: null,
  ap_contact: null,
  director: null,
  resale_cert_number: null,
  resale_cert_state: null,
  r2_cert_number: null,
  duns_number: null,
  monthly_volume: null,
  carrier_account: null,
  trade_references: null,
  extra: {},
  status: 'draft',
  submitted_at: null,
  reviewed_at: null,
  review_note: null,
});

export function useBusinessProfile(accountId: string | null | undefined) {
  return useQuery({
    queryKey: ['business-profile', accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<BusinessProfile | null> => {
      const { data, error } = await supabase.from('business_profiles').select('*').eq('account_id', accountId!).maybeSingle();
      if (error) throw new Error(error.message);
      return data as BusinessProfile | null;
    },
  });
}

/** Owner saves (draft) or submits for review. */
export function useSaveBusinessProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ profile, submit }: { profile: BusinessProfile; submit: boolean }) => {
      const { status: _s, submitted_at: _a, reviewed_at: _b, review_note: _c, ...rest } = profile;
      const { error } = await supabase.from('business_profiles').upsert({ ...rest, status: submit ? 'submitted' : 'draft' }, { onConflict: 'account_id' });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['business-profile', v.profile.account_id] });
      void qc.invalidateQueries({ queryKey: ['my-order-requirements'] });
    },
  });
}

export function useReviewBusinessProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { accountId: string; status: 'approved' | 'changes_requested'; note: string }) => {
      const { error } = await supabase.rpc('review_business_profile', { p_account_id: v.accountId, p_status: v.status, p_note: v.note || null });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, v) => void qc.invalidateQueries({ queryKey: ['business-profile', v.accountId] }),
  });
}

export type DocumentKind = 'w9' | 'resale_cert' | 'r2_cert' | 'dnb_report' | 'articles' | 'owner_id' | 'other';
export const DOCUMENT_SLOTS: { kind: DocumentKind; label: string; help: string }[] = [
  { kind: 'w9', label: 'W-9', help: 'IRS Form W-9, signed.' },
  { kind: 'resale_cert', label: 'Resale certificate', help: 'Texas (or your state) sales-tax resale certificate.' },
  { kind: 'r2_cert', label: 'R2 certificate', help: 'Responsible Recycling certification, if you have it.' },
  { kind: 'dnb_report', label: 'D&B report', help: 'Dun & Bradstreet report or D-U-N-S confirmation.' },
  { kind: 'articles', label: 'Articles of incorporation', help: 'Or certificate of formation.' },
  { kind: 'owner_id', label: 'Director ID', help: 'Government ID of the director who signs.' },
  { kind: 'other', label: 'Other', help: 'Anything else we asked for.' },
];

export interface AccountDocument {
  id: string;
  account_id: string;
  kind: DocumentKind;
  file_path: string;
  file_name: string | null;
  status: 'pending' | 'approved' | 'rejected';
  uploaded_at: string;
  review_note: string | null;
}

export function useAccountDocuments(accountId: string | null | undefined) {
  return useQuery({
    queryKey: ['account-documents', accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<AccountDocument[]> => {
      const { data, error } = await supabase.from('account_documents').select('id, account_id, kind, file_path, file_name, status, uploaded_at, review_note').eq('account_id', accountId!).order('uploaded_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as AccountDocument[];
    },
  });
}

const DOC_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg']);

export async function uploadAccountDocument(accountId: string, kind: DocumentKind, file: File): Promise<void> {
  if (!DOC_TYPES.has(file.type)) throw new Error('Use a PDF, PNG or JPG file.');
  if (file.size > 10 * 1024 * 1024) throw new Error('The file must be 10 MB or smaller.');
  const ext = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg';
  const path = `${accountId}/${kind}/${Date.now()}.${ext}`;
  const up = await supabase.storage.from('account-documents').upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) throw new Error(up.error.message);
  const { data: u } = await supabase.auth.getUser();
  const { error } = await supabase.from('account_documents').insert({ account_id: accountId, kind, file_path: path, file_name: file.name.slice(0, 200), uploaded_by: u.user?.id ?? null });
  if (error) throw new Error(error.message);
}

export async function documentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('account-documents').createSignedUrl(path, 300);
  if (error || !data) throw new Error(error?.message ?? 'Could not open the document.');
  return data.signedUrl;
}

export function useReviewDocument(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; status: 'approved' | 'rejected' | 'pending'; note?: string }) => {
      const { error } = await supabase.rpc('review_document', { p_document_id: v.id, p_status: v.status, p_note: v.note ?? null });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['account-documents', accountId] }),
  });
}

export interface AgreementVersion {
  id: string;
  version: string;
  title: string;
  body: string;
  sha256: string;
  is_active: boolean;
  published_at: string | null;
  created_at: string;
}

export function useAgreementVersions() {
  return useQuery({
    queryKey: ['agreement-versions'],
    queryFn: async (): Promise<AgreementVersion[]> => {
      const { data, error } = await supabase.from('agreement_versions').select('*').order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as AgreementVersion[];
    },
  });
}

export interface AgreementSignature {
  id: string;
  account_id: string;
  version_id: string;
  signer_name: string;
  signer_title: string;
  content_sha256: string;
  ip: string | null;
  user_agent: string | null;
  signed_at: string;
}

export function useAgreementSignatures(accountId: string | null | undefined) {
  return useQuery({
    queryKey: ['agreement-signatures', accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<AgreementSignature[]> => {
      const { data, error } = await supabase.from('agreement_signatures').select('*').eq('account_id', accountId!).order('signed_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as AgreementSignature[];
    },
  });
}

export function useSignAgreement(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { versionId: string; name: string; title: string }) => {
      const { error } = await supabase.rpc('sign_agreement', { p_version_id: v.versionId, p_name: v.name, p_title: v.title });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['agreement-signatures', accountId] });
      void qc.invalidateQueries({ queryKey: ['my-order-requirements'] });
    },
  });
}
