import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Clears the sticky header (h-16) plus a little breathing room.
const HEADER_OFFSET = 80;

/**
 * SPA scroll behavior: jump to top on route change, and scroll to the target
 * element when the URL carries a hash (#brands, #partner, …). React Router does
 * neither on its own.
 *
 * Uses an explicit INSTANT window.scroll, not scrollIntoView. The app sets a
 * global `html { scroll-behavior: smooth }`, and smooth programmatic scrolls are
 * unreliable here — a smooth scrollIntoView leaves the page unmoved (competing/
 * canceled animations), while `window.scroll({behavior:'instant'})` always lands.
 * A few retries absorb async content above the target shifting its position.
 */
export function ScrollToHash() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (!hash) {
      window.scroll({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
      return;
    }

    const id = decodeURIComponent(hash.slice(1));
    const timers: number[] = [];
    const jump = () => {
      const el = document.getElementById(id);
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET;
      window.scroll({ top: Math.max(0, top), behavior: 'instant' as ScrollBehavior });
    };
    // Retry so late-loading content above the target (e.g. the async catalog
    // grid) doesn't leave us parked at the wrong offset.
    [60, 250, 600].forEach((ms) => timers.push(window.setTimeout(jump, ms)));
    return () => timers.forEach(clearTimeout);
  }, [pathname, hash]);

  return null;
}
