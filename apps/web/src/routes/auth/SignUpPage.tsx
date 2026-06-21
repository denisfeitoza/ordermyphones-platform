import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/store';
import { AuthLayout, AuthField, PasswordField } from '@/components/auth/AuthLayout';
import { Button } from '@/components/ui/Button';

export default function SignUpPage() {
  const { signedIn, signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');

  if (signedIn) return <Navigate to="/portal" replace />;

  function submit(e: FormEvent) {
    e.preventDefault();
    signIn(email);
    navigate('/portal', { replace: true });
  }

  return (
    <AuthLayout
      title="Create your business account"
      subtitle="Tier pricing applies automatically as your volume grows."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/auth/sign-in" className="font-medium text-brand hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <AuthField label="Business name" required autoComplete="organization" placeholder="Downtown Mobile LLC" />
        <AuthField
          label="Work email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@store.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <AuthField label="Reseller permit" hint="Optional — unlocks tax-exempt orders once verified." placeholder="TX-RST-…" />
        <PasswordField label="Password" required autoComplete="new-password" placeholder="At least 8 characters" />

        <Button type="submit" size="lg" className="w-full">
          Create account
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Mockup — no account is actually created or stored.
        </p>
      </form>
    </AuthLayout>
  );
}
