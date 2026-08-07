import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Logo } from '@/components/store/Logo';

/**
 * STUB — Plan 01-10 rebuilds this page as the real Supabase PKCE /
 * PASSWORD_RECOVERY callback handler. For now it creates no session and
 * ignores query params (an untrusted `?from=` redirect target was a stub-era
 * open-redirect shape and must not come back): it just returns the visitor to
 * sign-in.
 */
export default function CallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => {
      navigate('/auth/sign-in', { replace: true });
    }, 1200);
    return () => clearTimeout(t);
  }, [navigate]);

  return (
    <div className="grid min-h-dvh place-items-center px-5">
      <div className="flex flex-col items-center gap-5 text-center">
        <Logo />
        <Loader2 className="h-6 w-6 animate-spin text-brand" />
        <div>
          <p className="font-medium">Returning you to sign-in…</p>
        </div>
      </div>
    </div>
  );
}
