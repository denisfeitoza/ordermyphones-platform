import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * Mock session for the demo — no backend, no real credentials. Any email "signs
 * in" to the single seeded business account (Downtown Mobile LLC, owned by
 * AccountProvider). Persisted to localStorage so the gate survives reloads.
 */
export interface AuthUser {
  email: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  signedIn: boolean;
  signIn: (email: string) => void;
  signOut: () => void;
}

const STORAGE_KEY = 'omp_auth_v1';
const AuthContext = createContext<AuthContextValue | null>(null);

function loadUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AuthUser;
      if (parsed && typeof parsed.email === 'string') return parsed;
    }
  } catch {
    // ignore malformed storage
  }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => loadUser());

  const signIn = useCallback((email: string) => {
    const next: AuthUser = { email: email.trim() || 'ops@downtownmobile.co' };
    setUser(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage may be unavailable (private mode) — session still holds in memory
    }
  }, []);

  const signOut = useCallback(() => {
    setUser(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // non-fatal
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, signedIn: user !== null, signIn, signOut }),
    [user, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
