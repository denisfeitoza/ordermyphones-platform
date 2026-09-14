import { supabase } from '@/lib/supabase';
import type { DbTier, InviteRow } from '@/lib/invites';

/**
 * Sub-accounts (distributor/wholesale "Team"). An account owner (tier
 * wholesale/distributor, not itself a sub-account) can invite additional
 * logins under its own account; every sub-account shares the owner's tier
 * and the owner's address book (public.addresses, scoped by
 * account_id = current_account_id()).
 *
 * Mirrors apps/web/src/lib/invites.ts: create_sub_account_invite is the
 * owner-gated counterpart to create_invite, and redeem_invite (unchanged
 * client-side) finishes account creation from the same accept link.
 * 20260911100000_sub_accounts.sql.
 */

export interface SubAccountRow {
  id: string;
  email: string;
  display_name: string | null;
  tier: DbTier | null;
  created_at: string;
}

/** True once profile.tier/parent_account_id are known — no DB round-trip. */
export function canManageSubAccounts(tier: DbTier | null, parentAccountId: string | null): boolean {
  return parentAccountId === null && (tier === 'wholesale' || tier === 'distributor');
}

export async function createSubAccountInvite(email: string): Promise<InviteRow> {
  const { data, error } = await supabase.rpc('create_sub_account_invite', { p_email: email });
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data[0] : data) as InviteRow;
}

/** Owner's own pending/accepted/revoked sub-account invites (RLS: parent_account_id = auth.uid()). */
export async function listSubAccountInvites(): Promise<InviteRow[]> {
  const { data, error } = await supabase
    .from('invites')
    .select('id,email,tier,token,status,invited_by,created_at,expires_at,accepted_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as InviteRow[];
}

/** Revoke one of the owner's own pending sub-account invites. */
export async function revokeSubAccountInvite(id: string): Promise<void> {
  const { error } = await supabase.from('invites').update({ status: 'revoked' }).eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * The owner's accepted sub-accounts. RLS on profiles is a union of "self",
 * "admin/staff" and "parent_account_id = auth.uid()" — the last is what
 * exposes sub-account rows to their owner, but the union also always
 * includes the caller's OWN row (the "self" arm), so it must be excluded
 * here explicitly rather than relied on to be absent.
 */
export async function listSubAccounts(): Promise<SubAccountRow[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id,email,display_name,tier,created_at')
    .not('parent_account_id', 'is', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SubAccountRow[];
}
