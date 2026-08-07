import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Logo } from '@/components/store/Logo';
import { PasswordField } from '@/components/auth/AuthLayout';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/store';
import { homePathForRole } from '@/lib/roleRoutes';
import { useI18n } from '@/i18n';

/**
 * PKCE / password-recovery callback. `detectSessionInUrl: true` (lib/supabase.ts)
 * exchanges the `?code=` query param for a session automatically — this page never
 * hand-parses the URL. Do NOT read `?from=`/`?email=`: an attacker-supplied redirect
 * target here would be an open redirect (T-01-61); post-recovery navigation is
 * always derived from the signed-in account's own role.
 *
 * Race note: the exchange can complete before this component mounts (the Supabase
 * client is a module-level singleton created on import, well before this route
 * renders), so the `PASSWORD_RECOVERY` event from `onAuthStateChange` can fire and
 * be missed. Three independent recovery signals are combined so a late mount still
 * lands correctly: (1) the listener itself, for an exchange that completes after
 * mount; (2) `?code=` still present in the URL at mount, for an exchange still in
 * flight; (3) an existing session at mount, for an exchange that finished before
 * the listener attached. Known limitation: an already-signed-in user who manually
 * navigates to `/auth/callback` with no `code` in the URL will not see the
 * recovery form (falls through to the error state) — this route is never linked
 * to except from a recovery email, so that's the only reachable path in practice.
 */
type Phase = 'exchanging' | 'recovery' | 'success' | 'error';

const EXCHANGE_TIMEOUT_MS = 8000;

export default function CallbackPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { role, loading: authLoading } = useAuth();

  const [phase, setPhase] = useState<Phase>('exchanging');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const settled = useRef(false);

  useEffect(() => {
    const hadCodeParam = new URLSearchParams(window.location.search).has('code');

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      // SYNCHRONOUS ONLY (Pitfall 4) — no awaited Supabase calls in this callback.
      if (event === 'PASSWORD_RECOVERY') {
        settled.current = true;
        setPhase('recovery');
      }
    });

    // Covers the exchange having already finished before this listener attached.
    supabase.auth.getSession().then(({ data }) => {
      if (settled.current) return;
      if (data.session && hadCodeParam) {
        settled.current = true;
        setPhase('recovery');
      }
    });

    const timeout = window.setTimeout(() => {
      if (!settled.current) {
        settled.current = true;
        setPhase('error');
      }
    }, EXCHANGE_TIMEOUT_MS);

    return () => {
      sub.subscription.unsubscribe();
      window.clearTimeout(timeout);
    };
  }, []);

  // Once the new password is set, wait for the recovered session's profile/role
  // to resolve (AuthProvider's own listener re-fetches it in parallel) before
  // routing — navigating with a stale `null` role would bounce through '/'.
  useEffect(() => {
    if (phase !== 'success' || authLoading) return;
    const t = window.setTimeout(() => navigate(homePathForRole(role), { replace: true }), 1200);
    return () => window.clearTimeout(t);
  }, [phase, authLoading, role, navigate]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setFormError(null);
    if (password.length < 8) {
      setFormError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setFormError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (error) {
      setFormError(error.message);
      return;
    }
    setPhase('success');
  }

  return (
    <div className="grid min-h-dvh place-items-center px-5">
      <div className="flex w-full max-w-sm flex-col items-center gap-5 text-center">
        <Logo />

        {phase === 'exchanging' && (
          <>
            <Loader2 className="h-6 w-6 animate-spin text-brand" aria-label={t('Loading')} />
            <p className="font-medium">{t('Confirming your link…')}</p>
          </>
        )}

        {phase === 'recovery' && (
          <form onSubmit={submit} className="w-full space-y-4 text-left">
            <div className="text-center">
              <h1 className="font-display text-xl font-semibold tracking-tight">{t('Set a new password')}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t('Choose a new password for your account.')}</p>
            </div>
            <PasswordField
              label="New password"
              required
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <PasswordField
              label="Confirm new password"
              required
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            {formError && (
              <p role="alert" className="text-sm text-destructive">
                {t(formError)}
              </p>
            )}
            <Button type="submit" size="lg" className="w-full" disabled={submitting}>
              {submitting ? t('Saving…') : t('Set new password')}
            </Button>
          </form>
        )}

        {phase === 'success' && (
          <>
            <CheckCircle2 className="h-8 w-8 text-success" aria-hidden />
            <p className="font-medium">{t('Password updated. Taking you to your account…')}</p>
          </>
        )}

        {phase === 'error' && (
          <>
            <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden />
            <div>
              <p className="font-medium">{t('This link is invalid or has expired.')}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('Request a new one from the reset page.')}
              </p>
            </div>
            <Link to="/auth/reset" className="font-medium text-brand hover:underline">
              {t('Back to reset password')}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
