import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/store';
import { AuthLayout, AuthField, PasswordField } from '@/components/auth/AuthLayout';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n';

export default function SignInPage() {
  const { t } = useI18n();
  const { signedIn, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/admin';
  const [email, setEmail] = useState('');

  if (signedIn) return <Navigate to="/admin" replace />;

  function submit(e: FormEvent) {
    e.preventDefault();
    signIn(email);
    navigate(from, { replace: true });
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
          <PasswordField label="Password" required autoComplete="current-password" placeholder="••••••••" />
          <div className="mt-1.5 text-right">
            <Link to="/auth/reset" className="text-xs text-muted-foreground hover:text-foreground">
              {t('Forgot password?')}
            </Link>
          </div>
        </div>

        <Button type="submit" size="lg" className="w-full">
          {t('Sign in')}
        </Button>
      </form>
    </AuthLayout>
  );
}
