import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { useAuth } from '@/store';
import { AuthLayout, AuthField, PasswordField } from '@/components/auth/AuthLayout';
import { Button } from '@/components/ui/Button';

export default function SignInPage() {
  const { signedIn, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/portal';
  const [email, setEmail] = useState('ops@downtownmobile.co');

  if (signedIn) return <Navigate to="/portal" replace />;

  function submit(e: FormEvent) {
    e.preventDefault();
    signIn(email);
    navigate(from, { replace: true });
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Access your orders, tier, and saved details."
      footer={
        <>
          New to OrderMyPhones?{' '}
          <Link to="/auth/sign-up" className="font-medium text-brand hover:underline">
            Create an account
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
          <PasswordField label="Password" required autoComplete="current-password" placeholder="••••••••" hint="Demo — any password works." />
          <div className="mt-1.5 text-right">
            <Link to="/auth/reset" className="text-xs text-muted-foreground hover:text-foreground">
              Forgot password?
            </Link>
          </div>
        </div>

        <Button type="submit" size="lg" className="w-full">
          Sign in
        </Button>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>

      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full"
        onClick={() => navigate(`/auth/callback?email=${encodeURIComponent(email)}`)}
      >
        <Mail className="h-4 w-4" strokeWidth={2} />
        Email me a magic link
      </Button>
    </AuthLayout>
  );
}
