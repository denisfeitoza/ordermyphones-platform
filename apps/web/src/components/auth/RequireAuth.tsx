import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/store';
import { homePathForRole, type AppRole } from '@/lib/roleRoutes';

/**
 * Role-aware route guard. Waits for the session AND the profile to resolve
 * before deciding anything (Pitfall 3) — a hard refresh must never bounce a
 * signed-in user to sign-in just because Supabase hasn't answered yet.
 *
 * `roles` is optional; omitting it means "any authenticated user".
 */
export function RequireAuth({ children, roles }: { children: ReactNode; roles?: AppRole[] }) {
  const { session, role, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand" aria-label="Loading" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/auth/sign-in" state={{ from: location.pathname + location.search }} replace />;
  }

  // A session whose profile failed to load is a broken account, not a
  // permissive one (T-01-48) — treat a null role as unauthorized. No `from`
  // state here: SignInPage's own guard requires a resolved `role` before
  // navigating away, so passing `from` back to this same broken account would
  // otherwise ping-pong between the two guards.
  if (!role) {
    return <Navigate to="/auth/sign-in" replace />;
  }

  if (roles && !roles.includes(role)) {
    return <Navigate to={homePathForRole(role)} replace />;
  }

  return <>{children}</>;
}
