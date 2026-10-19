import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

/** Small caption over a product image that only illustrates the model. */
export function IllustrativeTag({ className }: { className?: string }) {
  const { t } = useI18n();
  return (
    <span
      className={cn(
        'pointer-events-none absolute bottom-3 left-3 z-10 rounded-full bg-background/85 px-2 py-0.5 text-[0.7rem] font-medium text-muted-foreground backdrop-blur',
        className,
      )}
    >
      {t('Illustrative image')}
    </span>
  );
}
