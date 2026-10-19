import { useRef, useState, type DragEvent } from 'react';
import { Check, ImagePlus, Smartphone } from 'lucide-react';
import { useImageSuggestions, type ImageSuggestion, type SuggestionReason } from '@/data/imageBank';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

const REASON: Record<SuggestionReason, { label: string; cls: string }> = {
  exact: { label: 'Same model', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300' },
  family: { label: 'Same family', cls: 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300' },
  similar: { label: 'Similar name', cls: 'bg-muted text-muted-foreground' },
  brand: { label: 'Same brand', cls: 'bg-muted text-muted-foreground' },
};

export interface PickedImage {
  assetId: string;
  url: string;
  mode: 'exact' | 'approx';
}

/**
 * Image for a model: the current pick, ranked suggestions from the image bank
 * (same model first, then family, similar name, brand) and an upload. A
 * suggestion of the same model is used as is; any other one asks whether it
 * IS this model (the bank learns the spelling) or only illustrates it (the
 * store labels it "illustrative image").
 */
export function ImagePicker({
  make,
  model,
  current,
  busy,
  error,
  onPick,
  onUpload,
}: {
  make: string;
  model: string;
  current: { url: string | null; approx: boolean };
  busy: boolean;
  error: string | null;
  onPick: (pick: PickedImage) => void;
  onUpload: (file: File) => void;
}) {
  const { t } = useI18n();
  const q = useImageSuggestions(model, make);
  const [pending, setPending] = useState<ImageSuggestion | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const suggestions = (q.data ?? []).filter((s) => s.url !== current.url).slice(0, 8);

  function choose(s: ImageSuggestion) {
    if (s.reason === 'exact') {
      setPending(null);
      onPick({ assetId: s.assetId, url: s.url, mode: 'exact' });
    } else {
      setPending(s);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f && !busy) onUpload(f);
  }

  return (
    <div
      className={cn('space-y-3 rounded-xl transition-colors', dragOver && 'bg-brand/5 ring-2 ring-brand/40')}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <div className="flex items-start gap-4">
        <div className="relative shrink-0">
          {current.url ? (
            <img src={current.url} alt={model} className="h-24 w-24 rounded-xl bg-muted object-contain" />
          ) : (
            <div className="grid h-24 w-24 place-items-center rounded-xl bg-muted text-muted-foreground/60">
              <Smartphone className="h-7 w-7" strokeWidth={1.5} />
            </div>
          )}
          {current.url && current.approx && (
            <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-[0.65rem] font-semibold text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">
              {t('Illustrative')}
            </span>
          )}
        </div>
        <div className="min-w-0 space-y-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
              e.target.value = '';
            }}
          />
          <Button size="sm" variant="outline" className="min-h-11 sm:min-h-0" disabled={busy} onClick={() => fileRef.current?.click()}>
            <ImagePlus className="h-4 w-4" strokeWidth={2} />
            {busy ? t('Working…') : current.url ? t('Upload another photo') : t('Upload photo')}
          </Button>
          <p className="text-xs text-muted-foreground">{t('JPG, PNG or WebP, or drop it here. It joins the image bank for the next products of this model.')}</p>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      </div>

      {(model.trim().length >= 2 || make.trim().length >= 2) && (
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">{t('From the image bank')}</p>
          {q.isLoading ? (
            <p className="text-xs text-muted-foreground">{t('Looking for images…')}</p>
          ) : q.isError ? (
            <p className="text-xs text-destructive">{t('Could not load suggestions.')}</p>
          ) : suggestions.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('No image in the bank looks like this model yet. Upload one.')}</p>
          ) : (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {suggestions.map((s) => {
                const r = REASON[s.reason];
                const active = pending?.assetId === s.assetId;
                return (
                  <li key={s.assetId}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => choose(s)}
                      aria-pressed={active}
                      className={cn(
                        'group flex w-full flex-col items-center gap-1.5 rounded-xl border p-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                        active ? 'border-brand bg-brand/5' : 'border-border hover:bg-muted/50',
                      )}
                      title={s.modelKeys.join(', ')}
                    >
                      <img src={s.url} alt={s.modelKeys[0] ?? ''} loading="lazy" className="aspect-square w-full rounded-lg bg-muted object-contain" />
                      <span className={cn('max-w-full truncate rounded-full px-1.5 py-0.5 text-[0.65rem] font-medium', r.cls)}>{t(r.label)}</span>
                      <span className="w-full truncate text-center text-[0.7rem] capitalize text-muted-foreground">{s.modelKeys[0] ?? ''}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {pending && (
        <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-3 text-sm" role="group" aria-label={t('How to use this image')}>
          <p>
            {t('This image is')} <b className="capitalize">{pending.modelKeys[0]}</b>. {t('Is it the same device as')} <b>{model.trim() || t('this model')}</b>?
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="brand"
              disabled={busy}
              onClick={() => {
                onPick({ assetId: pending.assetId, url: pending.url, mode: 'exact' });
                setPending(null);
              }}
            >
              <Check className="h-4 w-4" strokeWidth={2.5} />
              {t('Yes, same device')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => {
                onPick({ assetId: pending.assetId, url: pending.url, mode: 'approx' });
                setPending(null);
              }}
            >
              {t('Use as illustrative image')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t('“Same device” teaches the bank this name. An illustrative image shows a label in the store.')}</p>
        </div>
      )}
    </div>
  );
}
