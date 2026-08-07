import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, ClipboardList, AlertTriangle, ShoppingBag } from 'lucide-react';
import { useRealCart } from '@/store';
import { useRealCatalog, buildDisplayName } from '@/data/realCatalog';
import { parseQuickOrder, resolveQuickOrder, type QuickProblemReason } from '@/lib/quickOrder';
import { Button } from '@/components/ui/Button';
import { formatUsd } from '@/lib/format';
import { useI18n } from '@/i18n';

/**
 * Quick-order paste dialog (M2-P4). A buyer pastes a two-column SKU/qty list;
 * we live-resolve it against the real catalog and let them drop every matched,
 * priced line into the cart in one go. Problem lines (unreadable, unknown SKU,
 * or not priced for the caller's tier) are always shown, never silently
 * dropped. Real mode only (mounted from RealCatalogView).
 */
export function QuickOrderDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const { items } = useRealCatalog(true);
  const { add } = useRealCart();
  const [text, setText] = useState('');

  const { resolved, problems } = useMemo(() => {
    const parsed = parseQuickOrder(text);
    const res = resolveQuickOrder(parsed.lines, items);
    return { resolved: res.resolved, problems: [...parsed.problems, ...res.problems] };
  }, [text, items]);

  const totalUnits = resolved.reduce((s, r) => s + r.qty, 0);
  const totalCents = resolved.reduce((s, r) => s + (r.item.priceCents ?? 0) * r.qty, 0);

  const reasonLabel: Record<QuickProblemReason, string> = {
    bad_line: t("Couldn't read this line"),
    not_found: t('SKU not found'),
    unpriced: t('Not priced for your tier'),
  };

  function addAll() {
    for (const r of resolved) add(r.item.variantId, r.qty);
    setText('');
    onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button className="absolute inset-0 cursor-default bg-foreground/40 backdrop-blur-sm" onClick={onClose} aria-label={t('Close')} />
          <motion.div
            className="relative flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-background shadow-2xl sm:rounded-2xl"
            initial={{ y: 24, opacity: 0.6, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            <header className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-brand" strokeWidth={2} />
                <h2 className="font-display text-lg font-semibold tracking-tight">{t('Quick order')}</h2>
              </div>
              <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full hover:bg-muted" aria-label={t('Close')}>
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="quick-order-input">
                  {t('Paste one SKU per line, with a quantity')}
                </label>
                <textarea
                  id="quick-order-input"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={6}
                  spellCheck={false}
                  placeholder={'IPHONE15PROMAX-A2849-256GB-BLACK-DLSA-UNL-U, 5\nGALAXYNOTE205G-SMN981U-128GB-BRONZE-DLSB-ATT-U 3'}
                  className="w-full resize-y rounded-xl border border-border bg-muted/30 p-3 font-mono text-xs outline-none transition-colors focus:border-brand"
                />
                <p className="mt-1 text-xs text-muted-foreground">{t('Separate SKU and quantity with a comma, tab, or space. No quantity means one.')}</p>
              </div>

              {resolved.length > 0 && (
                <div className="rounded-xl border border-border">
                  <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('Ready to add')} · <span className="font-mono">{resolved.length}</span>
                  </div>
                  <ul className="divide-y divide-border">
                    {resolved.map((r) => (
                      <li key={r.item.variantId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{buildDisplayName(r.item)}</span>
                          <span className="font-mono text-xs text-muted-foreground">{r.item.sku}</span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="font-mono tabular-nums">{r.qty}</span>
                          <span className="text-muted-foreground"> × </span>
                          <span className="font-mono tabular-nums">{formatUsd(r.item.priceCents ?? 0)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {problems.length > 0 && (
                <div className="rounded-xl border border-warning/40 bg-warning/5">
                  <div className="flex items-center gap-1.5 border-b border-warning/30 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-warning">
                    <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2} />
                    {t('Needs attention')} · <span className="font-mono">{problems.length}</span>
                  </div>
                  <ul className="divide-y divide-warning/20">
                    {problems.map((p, i) => (
                      <li key={`${p.raw}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                        <span className="min-w-0 truncate font-mono text-xs">{p.raw}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{reasonLabel[p.reason]}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <footer className="border-t border-border px-5 py-4">
              <Button variant="primary" size="lg" className="w-full" onClick={addAll} disabled={resolved.length === 0}>
                <ShoppingBag className="h-4 w-4" strokeWidth={2} />
                {resolved.length === 0
                  ? t('Nothing to add yet')
                  : `${t('Add')} ${totalUnits} ${totalUnits === 1 ? t('unit') : t('units')} · ${formatUsd(totalCents)}`}
              </Button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
