import { useCallback, useSyncExternalStore } from 'react';

/**
 * Live `matchMedia` result. Lets a component mount only the layout for the
 * current breakpoint instead of rendering both and hiding one with CSS
 * (`hidden md:grid` / `md:hidden` doubles every row in the DOM).
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Tailwind `md` breakpoint (tailwind.config.ts screens.md = 768px). */
export const MD_QUERY = '(min-width: 768px)';
