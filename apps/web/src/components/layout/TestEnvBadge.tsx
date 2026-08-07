import { useAuth } from '@/store/auth';

/**
 * Discreet corner chip that marks a non-production / test-account session so a
 * rehearsal is never mistaken for production (TEST-READY-V1 §4).
 *
 * Visible when EITHER:
 *   - the signed-in account is is_test, OR
 *   - VITE_ENV is set to a non-production value (staging/test/preview).
 *
 * VITE_ENV UNSET is treated as production on purpose: the live storefront ships
 * without VITE_ENV, so an unset value must NOT light the badge for anonymous
 * visitors on the shared demo link (no regression). Denis opts a whole
 * environment in by setting VITE_ENV=staging|test. Documented in
 * docs/planning/AUTONOMOUS-DECISIONS.md.
 */
export default function TestEnvBadge() {
  const { profile } = useAuth();
  const env = import.meta.env.VITE_ENV;
  const envIsNonProd = typeof env === 'string' && env.length > 0 && env !== 'production';
  const show = profile?.is_test === true || envIsNonProd;
  if (!show) return null;

  const label = envIsNonProd ? `TEST · ${env}` : 'TEST DATA';

  return (
    <div
      role="status"
      aria-live="off"
      className="pointer-events-none fixed bottom-3 left-3 z-[60] select-none"
    >
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-100/95 px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wide text-amber-900 shadow-sm backdrop-blur">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        {label}
      </span>
    </div>
  );
}
