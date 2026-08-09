import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { AuthLayout, AuthField } from '@/components/auth/AuthLayout';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { publicBaseUrl } from '@/lib/siteUrl';
import { useI18n } from '@/i18n';

/** GoTrue's rate-limit error is the only failure mode worth surfacing — everything
 *  else (including "user not found", which GoTrue itself does not distinguish) gets
 *  the identical success panel so the form cannot be used to enumerate accounts
 *  (T-01-59). */
function isRateLimited(error: { status?: number | undefined; message?: string | undefined } | null): boolean {
  if (!error) return false;
  if (error.status === 429) return true;
  return /rate limit/i.test(error.message ?? '');
}

export default function ResetPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || pending) return;
    setPending(true);
    setError(null);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${publicBaseUrl()}/auth/callback`,
    });
    setPending(false);
    if (isRateLimited(resetError)) {
      setError('Too many requests — please wait a few minutes and try again.');
      return;
    }
    // Any other error (including "user not found") is swallowed: same success
    // panel whether or not the address has an account.
    setSent(true);
  }

  return (
    <AuthLayout
      title={sent ? 'Check your inbox' : 'Reset password'}
      {...(sent ? {} : { subtitle: 'We’ll email you a secure link to set a new password.' })}
      footer={
        <Link to="/auth/sign-in" className="inline-flex items-center gap-1.5 font-medium text-brand hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
          {t('Back to sign in')}
        </Link>
      }
    >
      {sent ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-start gap-3.5 rounded-2xl border border-border bg-card p-5"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-success/10 text-success">
            <MailCheck className="h-5 w-5" strokeWidth={2} />
          </span>
          <div>
            <p className="text-sm font-medium">{t('Link sent to')} {email}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t('Open it on this device to continue.')}</p>
          </div>
        </motion.div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <AuthField
            label="Work email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@store.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {t(error)}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? t('Sending…') : t('Send reset link')}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
