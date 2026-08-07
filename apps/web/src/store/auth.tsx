import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { AppRole } from '@/lib/roleRoutes';
import { identifyUser, resetAnalytics } from '@/lib/analytics';
import { setSentryUser } from '@/lib/sentry';

/**
 * Real Supabase Auth session + a TanStack-Query-backed `profiles` fetch for
 * role/tier. Replaces the old browser-storage mock entirely — there is no
 * fallback path, a wrong password never signs anyone in.
 */
export interface Profile {
  id: string;
  email: string;
  role: AppRole;
  tier: 'consumer' | 'retailer' | 'wholesale' | 'distributor' | null;
  is_test: boolean;
  display_name: string | null;
}

export interface AuthUser {
  id: string;
  email: string;
}

interface AuthContextValue {
  session: Session | null;
  user: AuthUser | null;
  profile: Profile | null;
  role: AppRole | null;
  loading: boolean;
  signedIn: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Maps GoTrue's raw error message to a single generic string — never surfaced verbatim,
 *  so a failed sign-in cannot be used as an account-existence oracle (T-01-43). */
function toGenericSignInError(): string {
  return 'Email or password is incorrect';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined); // undefined = still loading
  const queryClient = useQueryClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      // SYNCHRONOUS ONLY — never await inside this callback (Pitfall 4 / T-01-46):
      // the client holds an internal lock while dispatching it, and an awaited
      // Supabase call here can deadlock the auth client.
      setSession(s);
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    });

    return () => sub.subscription.unsubscribe();
  }, [queryClient]);

  const profileQuery = useQuery({
    queryKey: ['profile', session?.user.id],
    enabled: !!session?.user.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id,email,role,tier,is_test,display_name')
        .eq('id', session!.user.id)
        .single();
      if (error) throw error;
      return data as Profile;
    },
  });

  // `undefined` = getSession() hasn't resolved yet; `null` = resolved, no session.
  // Collapsing those two into one nullable value is what causes the refresh flicker (Pitfall 3).
  const loading = session === undefined || (!!session && profileQuery.isPending);

  const signIn = useCallback(async (email: string, password: string): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: toGenericSignInError() };
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    // remove, not invalidate — a subsequent different user must never briefly
    // render the previous user's cached profile (T-01-47).
    queryClient.removeQueries({ queryKey: ['profile'] });
    // Observability cleanup on sign-out (OBSERVABILITY.md §5.7): drop the
    // PostHog identity and the Sentry user so a later session isn't attributed
    // to the previous account. No-op when analytics/Sentry are unconfigured.
    resetAnalytics();
    setSentryUser(null);
  }, [queryClient]);

  const user: AuthUser | null = session ? { id: session.user.id, email: session.user.email ?? '' } : null;

  // A session whose profile row failed to load (e.g. missing row) is a broken
  // account, not a permissive one — expose no profile/role so RequireAuth
  // bounces to sign-in rather than trusting an unknown role (T-01-48).
  const profile = profileQuery.isError ? null : (profileQuery.data ?? null);
  const role = profile?.role ?? null;

  // Identify to PostHog + Sentry by the profile UUID ONLY (never email) once
  // the profile resolves — per docs/security/DATA-CLASSIFICATION.md §4. Both
  // calls no-op when their SDK is unconfigured. Sign-out clears them (signOut).
  useEffect(() => {
    if (!profile?.id) return;
    identifyUser(profile.id, { role: profile.role, tier: profile.tier, is_test: profile.is_test });
    setSentryUser(profile.id);
  }, [profile?.id, profile?.role, profile?.tier, profile?.is_test]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session: session ?? null,
      user,
      profile,
      role,
      loading,
      signedIn: !!session,
      signIn,
      signOut,
    }),
    [session, user, profile, role, loading, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
