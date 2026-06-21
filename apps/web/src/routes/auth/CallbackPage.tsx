import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/store';
import { Logo } from '@/components/store/Logo';

/** Simulates a magic-link / OAuth callback: verify, sign in, then land in the portal. */
export default function CallbackPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const email = params.get('email') ?? '';

  useEffect(() => {
    const t = setTimeout(() => {
      signIn(email);
      navigate('/admin', { replace: true });
    }, 1600);
    return () => clearTimeout(t);
  }, [email, signIn, navigate]);

  return (
    <div className="grid min-h-dvh place-items-center px-5">
      <div className="flex flex-col items-center gap-5 text-center">
        <Logo />
        <Loader2 className="h-6 w-6 animate-spin text-brand" />
        <div>
          <p className="font-medium">Verifying your magic link…</p>
          <p className="mt-1 text-sm text-muted-foreground">{email ? `Signing in ${email}` : 'Signing you in'}</p>
        </div>
      </div>
    </div>
  );
}
