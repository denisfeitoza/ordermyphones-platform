/**
 * Single source of truth mapping a Supabase-backed role to the surface it
 * lands on after sign-in. `SignInPage`, `RequireAuth` and (plan 01-10)
 * `Header` all import from here — never inline '/admin' or '/portal'
 * anywhere else.
 */
export type AppRole = 'admin' | 'staff' | 'customer';

export const ROLE_HOME: Record<AppRole, string> = {
  admin: '/admin',
  staff: '/admin',
  customer: '/portal',
};

/** Returns the role's home route, or '/' when the role is unknown/absent. */
export function homePathForRole(role: AppRole | null | undefined): string {
  if (!role) return '/';
  return ROLE_HOME[role] ?? '/';
}
