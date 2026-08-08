import { useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import content from './manual.doc.html?raw';
import { useI18n } from '@/i18n';

/**
 * System manual — full-screen, admin-gated (option B). Rendered as the page
 * itself (NO iframe — the iframe made it feel like a window inside a window and
 * broke the TOC). The whole page is its own scroll container; TOC clicks are
 * intercepted and scrolled with scrollIntoView (native #anchors don't move the
 * window here because the app scrolls a container, not <html>). Bilingual toggle
 * + print are React-driven. The real password is not in the bundle.
 */
export default function ManualPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [lang, setLang] = useState<'pt' | 'en'>('en');
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    root.querySelectorAll<HTMLElement>('[data-pt]').forEach((el) => {
      const v = lang === 'en' ? el.getAttribute('data-en') : el.getAttribute('data-pt');
      if (v == null) return;
      if (/[<&]/.test(v)) el.innerHTML = v;
      else el.textContent = v;
    });
  }, [lang]);

  // TOC links are <a href="#section">. Native fragment scroll AND scrollIntoView
  // are both no-ops inside this nested flex scroll container, so scroll it
  // explicitly: compute the target's offset within `ref` (which IS the scroller)
  // and scrollTo. Deterministic regardless of ancestor overflow.
  function onClick(e: MouseEvent<HTMLDivElement>) {
    const a = (e.target as HTMLElement).closest('a[href^="#"]');
    if (!a) return;
    const scroller = ref.current;
    const id = a.getAttribute('href')!.slice(1);
    const target = scroller?.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    if (scroller && target) {
      e.preventDefault();
      const top =
        target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 16;
      // 'auto' (instant): smooth scroll silently no-ops on this nested container.
      scroller.scrollTo({ top, behavior: 'auto' });
    }
  }

  // The manual renders always-dark (high contrast, easy to read). The bar is
  // styled with the same palette so it never clashes with the app's theme.
  return (
    <div className="flex h-dvh flex-col" style={{ background: '#0c0b10' }}>
      <div
        className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2.5"
        style={{ borderColor: '#2c2a38', background: '#0c0b10' }}
      >
        <button
          type="button"
          onClick={() => navigate('/admin')}
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors active:scale-[0.98]"
          style={{ borderColor: '#2c2a38', background: '#17161f', color: '#f4f3f8' }}
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2.25} />
          {t('Back to console')}
        </button>
        <span className="flex-1" />
        <div className="inline-flex gap-1 rounded-xl border p-1" style={{ borderColor: '#2c2a38', background: '#17161f' }}>
          {(['pt', 'en'] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className="min-h-[36px] rounded-lg px-4 text-sm font-bold transition-colors"
              style={
                lang === l
                  ? { background: '#9b8dff', color: '#0c0b10' }
                  : { color: '#a9a7b8', background: 'transparent' }
              }
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold active:scale-[0.98]"
          style={{ background: '#9b8dff', color: '#0c0b10' }}
        >
          <Printer className="h-4 w-4" strokeWidth={2.25} />
          {t('Print / PDF')}
        </button>
      </div>

      {/* Force the manual's own text color here: the app's global `body{color}`
          (zinc-950) wins over the manual's `body{color:var(--text)}` by cascade,
          leaving headings/bold invisible on dark. Setting it on the container
          fixes inheritance; elements with their own color (muted/accent) keep it. */}
      <div
        ref={ref}
        onClick={onClick}
        className="min-h-0 flex-1 overflow-y-auto"
        style={{ color: '#f4f3f8' }}
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </div>
  );
}
