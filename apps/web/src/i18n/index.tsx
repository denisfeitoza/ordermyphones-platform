import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { PT, ES } from './dict';

/**
 * Lightweight i18n for the storefront + portal.
 *
 * English literals ARE the keys: `t('Sign in')` looks the string up in the
 * active locale and falls back to the English literal itself when missing —
 * untranslated corners degrade to English instead of breaking the demo.
 * Admin stays English by design (locked decision: operator UI is EN).
 */
export type Lang = 'en' | 'pt' | 'es';

const STORAGE_KEY = 'omp_lang_v1';
const DICTS: Record<Exclude<Lang, 'en'>, Record<string, string>> = { pt: PT, es: ES };

function loadLang(): Lang {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'en' || raw === 'pt' || raw === 'es') return raw;
  } catch {
    // ignore
  }
  return 'en';
}

interface I18nValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (en: string) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => loadLang());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // storage may be unavailable — language still holds in memory
    }
    document.documentElement.lang = lang === 'pt' ? 'pt-BR' : lang;
  }, [lang]);

  const value = useMemo<I18nValue>(
    () => ({
      lang,
      setLang,
      t: (en: string) => (lang === 'en' ? en : DICTS[lang][en] ?? en),
    }),
    [lang],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within <I18nProvider>');
  return ctx;
}

const LANGS: readonly { code: Lang; label: string }[] = [
  { code: 'en', label: 'EN' },
  { code: 'pt', label: 'PT' },
  { code: 'es', label: 'ES' },
] as const;

/** Discreet language pill — lives at the right edge of the header. */
export function LangSwitch({ className, tone = 'light' }: { className?: string; tone?: 'light' | 'dark' }) {
  const { lang, setLang } = useI18n();
  const dark = tone === 'dark';
  return (
    <div
      role="group"
      aria-label="Language"
      className={cn(
        'inline-flex items-center rounded-full border p-0.5',
        dark ? 'border-white/15 bg-white/5' : 'border-border bg-muted/40',
        className,
      )}
    >
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => setLang(l.code)}
          aria-pressed={lang === l.code}
          className={cn(
            'rounded-full px-2 py-1 text-[0.65rem] font-bold tracking-wide transition-colors',
            lang === l.code
              ? dark
                ? 'bg-white text-foreground'
                : 'bg-foreground text-background'
              : dark
                ? 'text-background/60 hover:text-background'
                : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
