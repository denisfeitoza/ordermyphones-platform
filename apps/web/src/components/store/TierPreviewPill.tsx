import { useNavigate } from 'react-router-dom';
import { Eye, X } from 'lucide-react';
import { useTier } from '@/store';
import { TIERS } from '@/data/tiers';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

/**
 * Floating pill shown while an admin previews the store through a tier's eyes.
 * Lets them hop between tiers in one click and jump back to the admin console.
 */
export function TierPreviewPill() {
  const { previewCode, startPreview, stopPreview, tier } = useTier();
  const { t } = useI18n();
  const navigate = useNavigate();

  if (!previewCode) return null;

  return (
    <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div className="flex max-w-full items-center gap-2 overflow-x-auto rounded-full border border-white/15 bg-foreground/95 px-3 py-2 text-background shadow-2xl backdrop-blur">
        <Eye className="h-4 w-4 shrink-0 text-brand-2" strokeWidth={2} />
        <span className="whitespace-nowrap text-xs font-medium">
          {t('Viewing store as')} <b>{tier.label}</b>
        </span>
        <span className="h-4 w-px shrink-0 bg-white/20" />
        <div className="flex shrink-0 gap-1">
          {TIERS.map((tr) => (
            <button
              key={tr.code}
              type="button"
              onClick={() => startPreview(tr.code)}
              className={cn(
                'rounded-full px-2 py-1 font-mono text-[0.65rem] font-bold transition-colors',
                tr.code === previewCode
                  ? 'bg-background text-foreground'
                  : 'text-background/60 hover:bg-white/10 hover:text-background',
              )}
              title={tr.label}
            >
              {tr.short}
            </button>
          ))}
        </div>
        <span className="h-4 w-px shrink-0 bg-white/20" />
        <button
          type="button"
          onClick={() => {
            stopPreview();
            navigate('/admin');
          }}
          className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs text-background/80 transition-colors hover:bg-white/10 hover:text-background"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} />
          {t('Back to admin')}
        </button>
      </div>
    </div>
  );
}
