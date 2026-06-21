import { useEffect } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/store';
import { Logo } from '@/components/store/Logo';

/**
 * Shareable "just open it" entry links. /enter/admin and /enter/portal establish
 * a mock session (if none) and redirect into the gated surface — so a pasted link
 * lands on the destination without the sign-in step. The normal /auth gate stays
 * intact for everything else.
 */
const DEST: Record<string, { to: string; label: string }> = {
  admin: { to: '/admin', label: 'Opening the admin console…' },
  portal: { to: '/portal', label: 'Opening your customer portal…' },
};

export default function EnterPage() {
  const { where } = useParams();
  const { signedIn, signIn } = useAuth();
  const dest = DEST[where ?? ''] ?? DEST.admin;

  useEffect(() => {
    if (!signedIn) signIn('ops@downtownmobile.co');
  }, [signedIn, signIn]);

  if (signedIn) return <Navigate to={dest.to} replace />;

  return (
    <div className="grid min-h-dvh place-items-center px-5">
      <div className="flex flex-col items-center gap-4 text-center">
        <Logo />
        <Loader2 className="h-5 w-5 animate-spin text-brand" />
        <p className="text-sm text-muted-foreground">{dest.label}</p>
      </div>
    </div>
  );
}
