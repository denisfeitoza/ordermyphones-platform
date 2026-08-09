import { supabase } from '@/lib/supabase';
import { publicBaseUrl } from '@/lib/siteUrl';

/**
 * Invite RPC client. All three functions are SECURITY DEFINER RPCs
 * (20260807190000_invites.sql):
 *   - create_invite : admin/staff only (gated inside the RPC)
 *   - get_invite    : anon-callable, narrow projection for the accept page
 *   - redeem_invite : anon-callable, creates the account from a pending invite
 *
 * The customer NEVER touches the invites table directly — it has no anon/
 * customer RLS policy. These RPCs are the only surface.
 */

/** DB customer_tier enum — matches public.customer_tier, NOT the frontend tier_N codes. */
export type DbTier = 'consumer' | 'retailer' | 'wholesale' | 'distributor';

export type InviteStatus = 'pending' | 'accepted' | 'revoked';

export interface InviteRow {
  id: string;
  email: string;
  tier: DbTier;
  token: string;
  status: InviteStatus;
  invited_by: string | null;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
}

/** Narrow projection returned by get_invite — safe for anon. */
export interface PublicInvite {
  email: string;
  tier: DbTier;
  status: InviteStatus;
  expired: boolean;
}

export const DB_TIER_LABELS: Record<DbTier, string> = {
  consumer: 'Consumer',
  retailer: 'Retailer',
  wholesale: 'Wholesale',
  distributor: 'Distributor',
};

export const DB_TIERS: readonly DbTier[] = ['consumer', 'retailer', 'wholesale', 'distributor'] as const;

/** Business tiers require a tax certificate (G2). Consumer does not. */
export function isBusinessTier(tier: DbTier): boolean {
  return tier !== 'consumer';
}

/** Build the copyable accept link from a token, rooted at the canonical public
 * URL — never localhost, even when generated from the local dev server. */
export function inviteLink(token: string): string {
  return `${publicBaseUrl()}/auth/invite?token=${encodeURIComponent(token)}`;
}

export async function createInvite(email: string, tier: DbTier): Promise<InviteRow> {
  const { data, error } = await supabase.rpc('create_invite', { p_email: email, p_tier: tier });
  if (error) throw new Error(error.message);
  // create_invite returns the row (PostgREST wraps a single-row SETOF as the object).
  return (Array.isArray(data) ? data[0] : data) as InviteRow;
}

/** Admin/staff listing of invites via the base table (RLS lets them read all). */
export async function listInvites(): Promise<InviteRow[]> {
  const { data, error } = await supabase
    .from('invites')
    .select('id,email,tier,token,status,invited_by,created_at,expires_at,accepted_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as InviteRow[];
}

/** Admin/staff revoke — a direct UPDATE, permitted by the admin RLS policy. */
export async function revokeInvite(id: string): Promise<void> {
  const { error } = await supabase.from('invites').update({ status: 'revoked' }).eq('id', id);
  if (error) throw new Error(error.message);
}

/** anon-callable — returns null when the token is unknown. */
export async function getInvite(token: string): Promise<PublicInvite | null> {
  const { data, error } = await supabase.rpc('get_invite', { p_token: token });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return (row as PublicInvite | undefined) ?? null;
}

/** Maps the RPC's raise-exception messages to stable app codes. */
export type RedeemErrorCode =
  | 'invalid_token'
  | 'invite_not_pending'
  | 'invite_expired'
  | 'display_name_required'
  | 'weak_password'
  | 'email_taken'
  | 'unknown';

function redeemErrorCode(message: string): RedeemErrorCode {
  const known: RedeemErrorCode[] = [
    'invalid_token',
    'invite_not_pending',
    'invite_expired',
    'display_name_required',
    'weak_password',
    'email_taken',
  ];
  const hit = known.find((c) => message.includes(c));
  return hit ?? 'unknown';
}

export interface RedeemResult {
  ok: true;
  email: string;
}

/** anon-callable — creates the account. Throws an Error whose `.message` is a RedeemErrorCode. */
export async function redeemInvite(token: string, displayName: string, password: string): Promise<RedeemResult> {
  const { data, error } = await supabase.rpc('redeem_invite', {
    p_token: token,
    p_display_name: displayName,
    p_password: password,
  });
  if (error) throw new Error(redeemErrorCode(error.message));
  return data as RedeemResult;
}
