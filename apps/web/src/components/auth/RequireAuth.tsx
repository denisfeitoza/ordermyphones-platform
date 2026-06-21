import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/store';

/** Gates a route behind the mock session; bounces to sign-in and remembers where you were headed. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { signedIn } = useAuth();
  const location = useLocation();

  if (!signedIn) {
    return <Navigate to="/auth/sign-in" state={{ from: location.pathname + location.search }} replace />;
  }
  return <>{children}</>;
}
