import { useState, type FormEvent } from 'react';
import { Loader2, ShieldAlert } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/store';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/Button';

/**
 * Fresh-credential gate for sensitive admin actions (role change, tier change,
 * location merge). The admin re-enters their password; we verify it with
 * supabase.auth.signInWithPassword against their own email before running the
 * action.
 *
 * Honest scope (see docs/planning/AUTONOMOUS-DECISIONS.md): this is a
 * CLIENT-SIDE confirmation. A wrong password leaves the existing session
 * intact (signInWithPassword only mints a new session on success), so it is
 * safe, but the RPC itself cannot verify freshness — server-enforced reauth
 * (an AAL2/nonce step) is a documented follow-up. reauthenticate() is
 * OTP/nonce-based and built for password updates, not a good fit for a modal
 * confirm, so signInWithPassword is the pragmatic real check.
 */
export function ConfirmPassword({
  open,
  title,
  description,
  actionLabel,
  danger = true,
  busy = false,
  onConfirmed,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  actionLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirmed: () => void;
  onCancel: () => void;
}) {
  const { user } = useAuth();
  const { t } = useI18n();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  if (!open) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!user?.email || !password) {
      setError(t('Enter your password to confirm.'));
      return;
    }
    setVerifying(true);
    setError(null);
    const { error: authError } = await supabase.auth.signInWithPassword({ email: user.email, password });
    setVerifying(false);
    if (authError) {
      setError(t('Password incorrect.'));
      return;
    }
    setPassword('');
    onConfirmed();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-lg">
        <div className="flex items-start gap-3">
          <span className={danger ? 'text-destructive' : 'text-brand'}>
            <ShieldAlert className="h-5 w-5" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
        </div>

        <form onSubmit={submit} className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{t('Confirm your password')}</span>
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(null);
              }}
              className="h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm outline-none transition-colors focus:border-brand"
              placeholder="••••••••"
            />
          </label>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                // Never leave the typed password in state — this component stays
                // mounted across open/close, so a lingering value would pre-fill
                // the next sensitive action's reauth prompt.
                setPassword('');
                setError(null);
                onCancel();
              }}
              disabled={verifying || busy}
            >
              {t('Cancel')}
            </Button>
            <Button type="submit" variant={danger ? 'brand' : 'primary'} size="sm" disabled={verifying || busy || !password}>
              {(verifying || busy) && <Loader2 className="h-4 w-4 animate-spin" />}
              {actionLabel}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
