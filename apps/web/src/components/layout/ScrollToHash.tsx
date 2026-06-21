import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * SPA scroll behavior: jump to top on route change, smooth-scroll to the target
 * element when the URL carries a hash (#shipping, #tiers, …). React Router does
 * neither on its own.
 */
export function ScrollToHash() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (!hash) {
      window.scrollTo({ top: 0, left: 0 });
      return;
    }
    const id = decodeURIComponent(hash.slice(1));
    // The target may mount a tick after navigation; retry briefly.
    const t = setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
    return () => clearTimeout(t);
  }, [pathname, hash]);

  return null;
}
