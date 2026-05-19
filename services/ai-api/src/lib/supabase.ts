import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env');
}

/**
 * Server-only client. Bypasses RLS — used by tools that read on behalf
 * of admin-supervised agents. Writes go exclusively through `propose_action`
 * (see tools/supabase-tools.ts).
 */
export const supabaseAdmin: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export type CallerRole = 'admin' | 'staff' | 'customer' | 'anon' | 'invalid';

/**
 * Resolve a caller's role from a Supabase JWT. The orchestrator refuses
 * to dispatch any request whose caller is not `admin` or `staff`.
 */
export async function resolveCallerRole(jwt: string): Promise<CallerRole> {
  try {
    const userClient = createClient(SUPABASE_URL!, jwt, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await userClient.auth.getUser();
    if (error || !data?.user) return 'invalid';
    const { data: row, error: roleErr } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', data.user.id)
      .single();
    if (roleErr || !row) return 'invalid';
    if (row.role === 'admin' || row.role === 'staff' || row.role === 'customer') return row.role;
    return 'invalid';
  } catch {
    return 'invalid';
  }
}
