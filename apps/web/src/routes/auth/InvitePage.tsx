import { useState, type FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useAuth } from '@/store';
import { AuthLayout, AuthField, PasswordField } from '@/components/auth/AuthLayout';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n';
import { homePathForRole } from '@/lib/roleRoutes';
import { getInvite, redeemInvite, isBusinessTier, DB_TIER_LABELS, type RedeemErrorCode } from '@/lib/invites';

/** Maps a redeem error code to a user-facing (translatable) message. */
const REDEEM_MESSAGE: Record<RedeemErrorCode, string> = {
  invalid_token: 'This invite link is not valid.',
  invite_not_pending: 'This invite has already been used or was revoked.',
  invite_expired: 'This invite has expired. Ask for a new one.',
  display_name_required: 'Please enter your name.',
  weak_password: 'Password must be at least 8 characters.',
  email_taken: 'An account already exists for this email. Try signing in.',
  unknown: 'Something went wrong. Please try again.',
};

/** A centered status card reused for the terminal (non-form) states. */
function StatusCard({ title, body, tone }: { title: string; body: string; tone: 'error' | 'ok' }) {
  const { t } = useI18n();
  return (
    <AuthLayout title={title} subtitle={body}>
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted/30 p-5">
        {tone === 'error' ? (
          <XCircle className="h-6 w-6 shrink-0 text-destructive" strokeWidth={2} />
        ) : (
          <CheckCircle2 className="h-6 w-6 shrink-0 text-success" strokeWidth={2} />
        )}
        <p className="text-sm text-muted-foreground">
          {t('Need help?')}{' '}
          <Link to="/auth/sign-in" className="font-medium text-brand hover:underline">
            {t('Go to sign in')}
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}

export default function InvitePage() {
  const { t } = useI18n();
  const { signedIn, role, loading: authLoading, signIn } = useAuth();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inviteQuery = useQuery({
    queryKey: ['invite', token],
    enabled: token.length > 0,
    retry: false,
    queryFn: () => getInvite(token),
  });

  // Once redeem + sign-in complete and the profile resolves, route by role.
  // NOT done inside the submit handler — `role` isn't populated on the tick
  // signIn() resolves (same pattern documented in SignInPage).
  if (!authLoading && signedIn && role) {
    return <Navigate to={homePathForRole(role)} replace />;
  }

  if (!token) {
    return <StatusCard tone="error" title="Invalid invite" body={t('This invite link is missing its token.')} />;
  }

  if (inviteQuery.isPending) {
    return (
      <AuthLayout title="Checking your invite…">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t('One moment.')}
        </div>
      </AuthLayout>
    );
  }

  const invite = inviteQuery.data;

  if (inviteQuery.isError || !invite) {
    return <StatusCard tone="error" title="Invalid invite" body={t('This invite link is not valid.')} />;
  }
  if (invite.status === 'revoked') {
    return <StatusCard tone="error" title="Invite revoked" body={t('This invite has been revoked. Ask for a new one.')} />;
  }
  if (invite.status === 'accepted') {
    return (
      <StatusCard
        tone="ok"
        title="Invite already used"
        body={t('This invite has already been used. Sign in with your email and password.')}
      />
    );
  }
  if (invite.expired) {
    return <StatusCard tone="error" title="Invite expired" body={t('This invite has expired. Ask for a new one.')} />;
  }

  const business = isBusinessTier(invite.tier);
  const nameLabel = business ? 'Business name' : 'Your name';

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting || !invite) return;
    setSubmitting(true);
    setError(null);
    try {
      await redeemInvite(token, displayName, password);
      // Account exists now — sign in. The render-time guard above navigates
      // once the profile resolves.
      const { error: signInError } = await signIn(invite.email, password);
      if (signInError) {
        setError(t('Account created. Please sign in with your email and password.'));
        setSubmitting(false);
      }
    } catch (err) {
      const code = (err as Error).message as RedeemErrorCode;
      setError(t(REDEEM_MESSAGE[code] ?? REDEEM_MESSAGE.unknown));
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="You’ve been invited. Set a password to finish — everything else you can add later."
      footer={
        <>
          {t('Already have an account?')}{' '}
          <Link to="/auth/sign-in" className="font-medium text-brand hover:underline">
            {t('Sign in')}
          </Link>
        </>
      }
    >
      <div className="mb-5 rounded-xl border border-border bg-muted/30 p-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">{t('Email')}</span>
          <span className="font-medium">{invite.email}</span>
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-muted-foreground">{t('Account tier')}</span>
          <span className="font-medium">{t(DB_TIER_LABELS[invite.tier])}</span>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <AuthField
          label={nameLabel}
          required
          autoComplete={business ? 'organization' : 'name'}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <PasswordField
          label="Password"
          required
          autoComplete="new-password"
          placeholder="••••••••"
          hint="At least 8 characters."
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting ? t('Creating your account…') : t('Create account')}
        </Button>
      </form>
    </AuthLayout>
  );
}
