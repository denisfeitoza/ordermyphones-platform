import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/store';
import { AuthLayout, AuthField, PasswordField } from '@/components/auth/AuthLayout';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n';
import { homePathForRole } from '@/lib/roleRoutes';

/** Accepts `from` only when it's a same-origin, single-slash path — closes the
 *  open-redirect shape (T-01-45) even though `from` comes from router state,
 *  not the URL bar, today. */
function safeFrom(from: unknown): string | null {
  if (typeof from !== 'string') return null;
  if (!from.startsWith('/') || from.startsWith('//')) return null;
  return from;
}

export default function SignInPage() {
  const { t } = useI18n();
  const { signedIn, signIn, role, loading } = useAuth();
  const location = useLocation();
  const from = safeFrom((location.state as { from?: string } | null)?.from);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Navigate on the render *after* the profile resolves — `role` is not
  // populated on the same tick `signIn()` resolves, so this must not be done
  // inside the submit handler. Hardcoding '/admin' would send every seeded
  // customer into the admin console.
  if (!loading && signedIn) {
    return <Navigate to={from ?? homePathForRole(role)} replace />;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    const { error: signInError } = await signIn(email, password);
    if (signInError) {
      setError(signInError);
      setPassword('');
      setPending(false);
      return;
    }
    // success: the `signedIn` early-return above handles navigation once the
    // profile resolves; nothing else to do here.
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle="One console for your orders, tiers, inventory, and the live bots."
      footer={
        <>
          {t('New to OrderMyPhones?')}{' '}
          <Link to="/auth/sign-up" className="font-medium text-brand hover:underline">
            {t('Create an account')}
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <AuthField
          label="Work email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div>
          <PasswordField
            label="Password"
            required
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className="mt-1.5 text-right">
            <Link to="/auth/reset" className="text-xs text-muted-foreground hover:text-foreground">
              {t('Forgot password?')}
            </Link>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {t(error)}
          </p>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? t('Signing in…') : t('Sign in')}
        </Button>
      </form>
    </AuthLayout>
  );
}
