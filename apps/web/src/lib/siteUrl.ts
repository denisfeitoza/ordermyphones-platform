/**
 * The canonical PUBLIC base URL for links we hand to customers (invite links,
 * password-reset redirects). These must never point at localhost or a per-deploy
 * preview host, because an admin often generates them from the local dev server
 * or a preview build.
 *
 * Resolution order:
 *   1. VITE_PUBLIC_SITE_URL  — set this on the host (Vercel) to the real domain
 *      (or a custom domain). Always wins.
 *   2. window.location.origin — used only when it is a real, non-local origin
 *      (so production/custom-domain "just works" without extra config).
 *   3. PROD_FALLBACK — the known production domain, so a link generated on
 *      localhost still resolves for the customer.
 */
const PROD_FALLBACK = 'https://ordermyphones.vercel.app';

const LOCAL = /^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/i;

export function publicBaseUrl(): string {
  const configured = import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined;
  if (configured && configured.trim()) return configured.trim().replace(/\/+$/, '');

  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    if (origin && !LOCAL.test(origin)) return origin.replace(/\/+$/, '');
  }

  return PROD_FALLBACK;
}
