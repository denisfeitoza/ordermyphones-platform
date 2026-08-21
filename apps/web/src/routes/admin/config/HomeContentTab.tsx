import { useEffect, useMemo, useState } from 'react';
import { Check, GripVertical, Plus, Search, Trash2, X } from 'lucide-react';
import {
  useHomeContent,
  useUpdateHomeContent,
  DEFAULT_HOME_CONTENT,
  HOME_ICONS,
  HOME_ICON_KEYS,
  type HomeContent,
  type HomeIconKey,
  type PromoCard,
} from '@/data/homeContent';
import { useRealCatalog, buildDisplayName } from '@/data/realCatalog';
import { Panel } from '@/components/admin/parts';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

const input =
  'w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-brand';

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors', on ? 'bg-brand' : 'bg-muted')}
    >
      <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', on ? 'left-[22px]' : 'left-0.5')} />
    </button>
  );
}

function newId() {
  return `promo-${Math.random().toString(36).slice(2, 8)}`;
}

/** Admin editor for the storefront home merchandising (Settings → Home & promos).
 *  Edits the single home_content jsonb block: benefits bar, promo cards, and the
 *  curated "trending" product list. Friendly, form-based, save-on-demand. */
export default function HomeContentTab() {
  const { t } = useI18n();
  const { data } = useHomeContent();
  const update = useUpdateHomeContent();
  const [draft, setDraft] = useState<HomeContent | null>(null);

  useEffect(() => {
    if (data && !draft) setDraft(data);
  }, [data, draft]);

  const dirty = useMemo(() => !!draft && !!data && JSON.stringify(draft) !== JSON.stringify(data), [draft, data]);

  if (!draft) return <p className="rounded-2xl border border-border bg-card p-16 text-center text-sm text-muted-foreground">{t('Loading…')}</p>;

  // Narrowed setters keep the immutable update noise out of the JSX.
  const setBenefits = (patch: Partial<HomeContent['benefits']>) => setDraft({ ...draft, benefits: { ...draft.benefits, ...patch } });
  const setPromos = (patch: Partial<HomeContent['promos']>) => setDraft({ ...draft, promos: { ...draft.promos, ...patch } });
  const setTrending = (patch: Partial<HomeContent['trending']>) => setDraft({ ...draft, trending: { ...draft.trending, ...patch } });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {t('Everything here shows on the public home page. Toggle a block off to hide it without losing its content.')}
        </p>
        <div className="flex items-center gap-2">
          {update.isSuccess && !dirty && (
            <span className="inline-flex items-center gap-1 text-sm text-success">
              <Check className="h-4 w-4" /> {t('Saved')}
            </span>
          )}
          <Button variant="outline" size="md" disabled={update.isPending} onClick={() => setDraft(DEFAULT_HOME_CONTENT)}>
            {t('Reset to defaults')}
          </Button>
          <Button variant="primary" size="md" disabled={!dirty || update.isPending} onClick={() => update.mutate(draft)}>
            {update.isPending ? t('Saving…') : t('Save changes')}
          </Button>
        </div>
      </div>

      {update.isError && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {(update.error as Error)?.message ?? t('Could not save.')}
        </p>
      )}

      {/* ---- Benefits bar ---- */}
      <Panel
        title={t('Benefits bar')}
        action={<Toggle on={draft.benefits.enabled} onChange={(v) => setBenefits({ enabled: v })} label={t('Show benefits bar')} />}
      >
        <p className="mb-4 text-sm text-muted-foreground">{t('The slim strip above the hero. Each item is an icon + a short line.')}</p>
        <div className="space-y-2">
          {draft.benefits.items.map((item, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-2.5">
              <div className="flex flex-wrap gap-1">
                {HOME_ICON_KEYS.map((key) => {
                  const Icon = HOME_ICONS[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      title={key}
                      onClick={() => setBenefits({ items: draft.benefits.items.map((it, j) => (j === i ? { ...it, icon: key } : it)) })}
                      className={cn(
                        'grid h-8 w-8 place-items-center rounded-lg border transition-colors',
                        item.icon === key ? 'border-brand bg-brand/10 text-brand' : 'border-border text-muted-foreground hover:bg-muted',
                      )}
                    >
                      <Icon className="h-4 w-4" strokeWidth={2} />
                    </button>
                  );
                })}
              </div>
              <input
                value={item.text}
                onChange={(e) => setBenefits({ items: draft.benefits.items.map((it, j) => (j === i ? { ...it, text: e.target.value } : it)) })}
                placeholder={t('Free shipping on approved orders')}
                className={`${input} min-w-[180px] flex-1`}
              />
              <button
                type="button"
                onClick={() => setBenefits({ items: draft.benefits.items.filter((_, j) => j !== i) })}
                className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                aria-label={t('Remove')}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setBenefits({ items: [...draft.benefits.items, { icon: 'Sparkles' as HomeIconKey, text: '' }] })}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
        >
          <Plus className="h-4 w-4" /> {t('Add item')}
        </button>

        <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">{t('Call-to-action label')}</span>
            <input value={draft.benefits.ctaLabel} onChange={(e) => setBenefits({ ctaLabel: e.target.value })} placeholder={t('Request access')} className={input} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">{t('Call-to-action link')}</span>
            <input value={draft.benefits.ctaHref} onChange={(e) => setBenefits({ ctaHref: e.target.value })} placeholder="/request-access" className={input} />
          </label>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{t('The call-to-action shows only to signed-out visitors.')}</p>
      </Panel>

      {/* ---- Promos ---- */}
      <Panel
        title={t('Promotions')}
        action={<Toggle on={draft.promos.enabled} onChange={(v) => setPromos({ enabled: v })} label={t('Show promotions')} />}
      >
        <label className="mb-4 flex flex-col gap-1.5 text-sm">
          <span className="font-medium">{t('Section title')}</span>
          <input value={draft.promos.title} onChange={(e) => setPromos({ title: e.target.value })} placeholder={t('Deals & promotions')} className={`${input} max-w-sm`} />
        </label>
        <div className="space-y-3">
          {draft.promos.cards.map((card, i) => {
            const patch = (p: Partial<PromoCard>) => setPromos({ cards: draft.promos.cards.map((c, j) => (j === i ? { ...c, ...p } : c)) });
            return (
              <div key={card.id} className="rounded-xl border border-border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <GripVertical className="h-3.5 w-3.5" /> {t('Promo')} {i + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPromos({ cards: draft.promos.cards.filter((_, j) => j !== i) })}
                    className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label={t('Remove')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input value={card.title} onChange={(e) => patch({ title: e.target.value })} placeholder={t('Save up to $500')} className={input} />
                  <input value={card.badge} onChange={(e) => patch({ badge: e.target.value })} placeholder={t('Limited time')} className={input} />
                  <input value={card.subtitle} onChange={(e) => patch({ subtitle: e.target.value })} placeholder={t('Short supporting line')} className={`${input} sm:col-span-2`} />
                  <input value={card.href} onChange={(e) => patch({ href: e.target.value })} placeholder="/catalog?condition=cpo" className={`${input} sm:col-span-2`} />
                </div>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setPromos({ cards: [...draft.promos.cards, { id: newId(), title: '', subtitle: '', badge: '', href: '/catalog' }] })}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
        >
          <Plus className="h-4 w-4" /> {t('Add promo')}
        </button>
      </Panel>

      {/* ---- Trending ---- */}
      <Panel
        title={t('Trending products')}
        action={<Toggle on={draft.trending.enabled} onChange={(v) => setTrending({ enabled: v })} label={t('Show trending')} />}
      >
        <label className="mb-4 flex flex-col gap-1.5 text-sm">
          <span className="font-medium">{t('Section title')}</span>
          <input value={draft.trending.title} onChange={(e) => setTrending({ title: e.target.value })} placeholder={t('Trending now')} className={`${input} max-w-sm`} />
        </label>
        <TrendingPicker
          variantIds={draft.trending.variantIds}
          onChange={(ids) => setTrending({ variantIds: ids })}
        />
      </Panel>
    </div>
  );
}

/** Search the live catalog and pick which variants appear in the trending strip. */
function TrendingPicker({ variantIds, onChange }: { variantIds: string[]; onChange: (ids: string[]) => void }) {
  const { t } = useI18n();
  const { items } = useRealCatalog(true);
  const [query, setQuery] = useState('');

  const byId = useMemo(() => new Map(items.map((i) => [i.variantId, i])), [items]);
  const chosen = new Set(variantIds);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return items
      .filter((i) => !chosen.has(i.variantId) && `${buildDisplayName(i)} ${i.make} ${i.sku}`.toLowerCase().includes(q))
      .slice(0, 6);
  }, [query, items, chosen]);

  return (
    <div className="space-y-3">
      {variantIds.length > 0 && (
        <ul className="space-y-1.5">
          {variantIds.map((id) => {
            const it = byId.get(id);
            return (
              <li key={id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                <span className="min-w-0 truncate">{it ? buildDisplayName(it) : id}</span>
                <button
                  type="button"
                  onClick={() => onChange(variantIds.filter((x) => x !== id))}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label={t('Remove')}
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={2} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('Search a model or SKU to feature…')}
          className={`${input} pl-9`}
        />
      </div>
      {results.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {results.map((it) => (
            <li key={it.variantId}>
              <button
                type="button"
                onClick={() => {
                  onChange([...variantIds, it.variantId]);
                  setQuery('');
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <span className="min-w-0 truncate">
                  {buildDisplayName(it)} <span className="text-xs text-muted-foreground">{it.sku}</span>
                </span>
                <Plus className="h-4 w-4 shrink-0 text-brand" strokeWidth={2.5} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
