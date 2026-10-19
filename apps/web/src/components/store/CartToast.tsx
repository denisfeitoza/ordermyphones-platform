import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { useRealCart } from '@/store';
import { formatInt } from '@/lib/format';
import { useI18n } from '@/i18n';

/**
 * "Added to cart" confirmation that does not interrupt: the buyer keeps
 * adding lines; "View cart" opens the drawer when they want it. Hides after
 * a few seconds; a new add restarts it.
 */
export function CartToast() {
  const { t } = useI18n();
  const { lastAdd, setOpen, open } = useRealCart();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!lastAdd) return;
    setVisible(true);
    const id = window.setTimeout(() => setVisible(false), 3500);
    return () => window.clearTimeout(id);
  }, [lastAdd]);

  if (!visible || !lastAdd || open) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[55] flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div role="status" className="pointer-events-auto flex items-center gap-3 rounded-full bg-foreground py-1.5 pl-4 pr-1.5 text-sm text-background shadow-lg">
        <Check className="h-4 w-4 shrink-0" strokeWidth={2.5} />
        <span>
          {lastAdd.lines === 1
            ? `${formatInt(lastAdd.units)} ${lastAdd.units === 1 ? t('unit') : t('units')} ${t('added to cart')}`
            : `${formatInt(lastAdd.lines)} ${t('lines added to cart')}`}
        </span>
        <button
          type="button"
          onClick={() => {
            setVisible(false);
            setOpen(true);
          }}
          className="min-h-11 rounded-full bg-background/15 px-4 font-medium hover:bg-background/25 sm:min-h-9"
        >
          {t('View cart')}
        </button>
      </div>
    </div>
  );
}
