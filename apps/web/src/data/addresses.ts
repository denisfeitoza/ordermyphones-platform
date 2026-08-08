/**
 * Address book (#06) — thin data layer over public.addresses. RLS scopes every
 * row to the caller (user_id = auth.uid()), so no filter is needed here; the
 * single-default invariant and default-after-delete promotion are enforced by
 * DB triggers, so the client just sets is_default=true and trusts the server.
 */
import { supabase } from '@/lib/supabase';

export interface AddressRow {
  id: string;
  label: string | null;
  recipient: string | null;
  street: string;
  city: string;
  state: string;
  zip: string;
  phone: string | null;
  is_default: boolean;
  created_at: string;
}

export interface AddressInput {
  label?: string | null;
  recipient?: string | null;
  street: string;
  city: string;
  state: string;
  zip: string;
  phone?: string | null;
  is_default?: boolean;
}

const COLS = 'id, label, recipient, street, city, state, zip, phone, is_default, created_at';

/** Default first, then newest — the order both the portal list and the checkout picker want. */
export async function listAddresses(): Promise<AddressRow[]> {
  const { data, error } = await supabase
    .from('addresses')
    .select(COLS)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as AddressRow[];
}

export async function createAddress(userId: string, input: AddressInput): Promise<AddressRow> {
  const { data, error } = await supabase
    .from('addresses')
    .insert({ user_id: userId, ...input })
    .select(COLS)
    .single();
  if (error) throw error;
  return data as AddressRow;
}

export async function updateAddress(id: string, patch: Partial<AddressInput>): Promise<void> {
  const { error } = await supabase.from('addresses').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteAddress(id: string): Promise<void> {
  const { error } = await supabase.from('addresses').delete().eq('id', id);
  if (error) throw error;
}

/** Set one address as default; the DB trigger clears the previous default. */
export async function setDefaultAddress(id: string): Promise<void> {
  const { error } = await supabase.from('addresses').update({ is_default: true }).eq('id', id);
  if (error) throw error;
}
