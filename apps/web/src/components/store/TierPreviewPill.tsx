import { useNavigate } from 'react-router-dom';
import { Eye, X } from 'lucide-react';
import { useAuth, useTier } from '@/store';
import { TIERS } from '@/data/tiers';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

/**
 * Floating pill for admin/staff browsing the customer storefront.
 *
 * Admins have no customer tier, so prices resolve to null and everything —
 * price tags, the Quick order — shows "No price" and is unusable for them. This
 * pill lets them preview the store through a tier's eyes: once a tier is picked,
 * useRealCatalog applies it (previewTier) and prices light up everywhere.
 *
 * Two states: a compact "preview pricing as…" starter when no tier is selected,
 * and the full tier-hopper once one is. Both are admin/staff only — the role
 * gate matches how realCatalog applies the preview, so a customer never sees it
 * (previewCode lives in sessionStorage and would otherwise leak across a
 * sign-out in the same tab — leak audit Finding 1).
 */
export function TierPreviewPill() {
  const { previewCode, startPreview, stopPreview, tier } = useTier();
  const { role } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();

  if (role !== 'admin' && role !== 'staff') return null;

  // No tier picked yet — offer to start a preview so prices (and Quick order) work.
  if (!previewCode) {
    return (
      <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
        <div className="flex max-w-full items-center gap-2 overflow-x-auto rounded-full border border-border bg-background/95 px-3 py-2 shadow-2xl backdrop-blur">
          <Eye className="h-4 w-4 shrink-0 text-brand" strokeWidth={2} />
          <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">
            {t('Preview pricing as')}
          </span>
          <div className="flex shrink-0 gap-1">
            {TIERS.map((tr) => (
              <button
                key={tr.code}
                type="button"
                onClick={() => startPreview(tr.code)}
                title={tr.label}
                className="rounded-full border border-border px-2.5 py-1 font-mono text-[0.65rem] font-bold text-muted-foreground transition-colors hover:border-brand hover:bg-secondary hover:text-foreground"
              >
                {tr.short}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

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
