import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, ImagePlus, Search, Smartphone, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { attachProductImage, uploadToLibrary } from '@/data/imageBank';
import { issuesOf, useApplyBestImages, useInvalidateProductHealth, useProductHealth, useSetPublished, type Issue, type ProductHealth } from '@/data/productHealth';
import { formatInt } from '@/lib/format';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

const ISSUE: Record<Issue, { label: string; cls: string }> = {
  no_image: { label: 'No image', cls: 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300' },
  approx_image: { label: 'Illustrative image', cls: 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300' },
  no_price: { label: 'No price', cls: 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300' },
  no_stock: { label: 'No stock', cls: 'bg-muted text-muted-foreground' },
  ready: { label: 'Ready to publish', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300' },
};
const FILTERS: (Issue | 'all')[] = ['all', 'no_image', 'approx_image', 'no_price', 'no_stock', 'ready'];
const REASON_LABEL = { exact: 'Same model', family: 'Same family', similar: 'Similar name' } as const;
const PAGE = 100;

/**
 * Admin → Inventory → Needs attention: after a big import, every product that
 * still lacks an image, a price, stock or the publish switch, as one dense
 * list. Fix a row in place (suggested image, upload, publish) or select many
 * and fix them together.
 */
export default function AttentionTab() {
  const { t } = useI18n();
  const q = useProductHealth();
  const apply = useApplyBestImages();
  const publish = useSetPublished();
  const [filter, setFilter] = useState<Issue | 'all'>('all');
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [allowApprox, setAllowApprox] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const withIssues = useMemo(() => (q.data ?? []).map((p) => ({ p, issues: issuesOf(p) })).filter((x) => x.issues.length > 0), [q.data]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: withIssues.length };
    for (const x of withIssues) for (const i of x.issues) c[i] = (c[i] ?? 0) + 1;
    return c;
  }, [withIssues]);
  const filtered = useMemo(() => {
    const n = query.trim().toLowerCase();
    return withIssues.filter((x) => (filter === 'all' || x.issues.includes(filter)) && (!n || `${x.p.make} ${x.p.model} ${x.p.modelNumber}`.toLowerCase().includes(n)));
  }, [withIssues, filter, query]);
  const list = filtered.slice(0, shown);
  const pickedIds = [...picked].filter((id) => filtered.some((x) => x.p.id === id));
  const busy = apply.isPending || publish.isPending;

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  function runApply(ids: string[]) {
    setNote(null);
    apply.mutate(
      { ids, allowApprox },
      {
        onSuccess: (r) =>
          setNote(
            `${r.exact} ${t('exact images')} · ${r.approx} ${t('illustrative')} · ${r.skipped} ${t('without a match (upload one)')}`,
          ),
      },
    );
  }

  function runPublish(ids: string[], value: boolean) {
    setNote(null);
    publish.mutate({ ids, published: value }, { onSuccess: (n) => setNote(`${n} ${value ? t('published') : t('hidden')}`) });
  }

  if (q.isLoading) return <p className="py-10 text-center text-sm text-muted-foreground">{t('Loading…')}</p>;
  if (q.isError) return <p className="py-10 text-center text-sm text-destructive">{q.error.message}</p>;

  return (
    <div className="space-y-4">
      <div className="scrollbar-hide -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => {
              setFilter(f);
              setShown(PAGE);
            }}
            className={cn(
              'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors sm:min-h-9',
              filter === f ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:bg-muted',
            )}
          >
            {f === 'all' ? t('Everything') : t(ISSUE[f].label)}
            <span className="font-mono text-xs tabular-nums opacity-80">{formatInt(counts[f] ?? 0)}</span>
          </button>
        ))}
      </div>

      {withIssues.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-14 text-center">
          <p className="font-medium">{t('Every product is complete.')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('Image, price, stock and published — nothing left to fix.')}</p>
        </div>
      ) : (
        <>
          <label className="relative block">
            <span className="sr-only">{t('Search products')}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={2} />
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShown(PAGE);
              }}
              placeholder={t('Search make, model or model number…')}
              className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-brand"
            />
          </label>

          <div className="sticky top-14 z-20 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card/95 px-3 py-2 text-sm backdrop-blur">
            <label className="flex min-h-11 items-center gap-2 pr-1">
              <input
                type="checkbox"
                className="h-4 w-4 accent-brand"
                checked={pickedIds.length > 0 && pickedIds.length === filtered.length}
                onChange={(e) => setPicked(e.target.checked ? new Set(filtered.map((x) => x.p.id)) : new Set())}
              />
              {pickedIds.length > 0 ? `${formatInt(pickedIds.length)} ${t('selected')}` : `${t('Select all')} (${formatInt(filtered.length)})`}
            </label>
            {pickedIds.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="brand" disabled={busy} onClick={() => runApply(pickedIds)}>
                  <Wand2 className="h-4 w-4" strokeWidth={2} />
                  {t('Use suggested images')}
                </Button>
                <label className="flex min-h-11 items-center gap-1.5 text-xs text-muted-foreground sm:min-h-0">
                  <input type="checkbox" className="h-4 w-4 accent-brand" checked={allowApprox} onChange={(e) => setAllowApprox(e.target.checked)} />
                  {t('also family images (labelled illustrative)')}
                </label>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => runPublish(pickedIds, true)}>
                  <Eye className="h-4 w-4" strokeWidth={2} />
                  {t('Publish')}
                </Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => runPublish(pickedIds, false)}>
                  {t('Hide')}
                </Button>
              </div>
            )}
            {(note || apply.isError || publish.isError) && (
              <p className={cn('basis-full text-xs', apply.isError || publish.isError ? 'text-destructive' : 'text-muted-foreground')} role="status">
                {apply.isError ? apply.error.message : publish.isError ? publish.error.message : note}
              </p>
            )}
          </div>

          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {list.map(({ p, issues }) => (
              <AttentionRow key={p.id} p={p} issues={issues} checked={picked.has(p.id)} onToggle={() => toggle(p.id)} busy={busy} onPublish={() => runPublish([p.id], true)} />
            ))}
            {list.length === 0 && <li className="px-4 py-10 text-center text-sm text-muted-foreground">{t('No products match.')}</li>}
          </ul>
          {filtered.length > list.length && (
            <Button variant="outline" className="w-full" onClick={() => setShown((n) => n + PAGE)}>
              {t('Show more')} ({formatInt(filtered.length - list.length)})
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function AttentionRow({
  p,
  issues,
  checked,
  onToggle,
  busy,
  onPublish,
}: {
  p: ProductHealth;
  issues: Issue[];
  checked: boolean;
  onToggle: () => void;
  busy: boolean;
  onPublish: () => void;
}) {
  const { t } = useI18n();
  const invalidate = useInvalidateProductHealth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsImage = !p.imageUrl || p.imageApprox;

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    setWorking(true);
    try {
      await fn();
      invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Action failed.'));
    } finally {
      setWorking(false);
    }
  }

  const showUrl = p.imageUrl ?? null;
  return (
    <li className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:flex-nowrap', checked && 'bg-brand/5')}>
      <label className="grid h-11 w-8 shrink-0 cursor-pointer place-items-center">
        <span className="sr-only">
          {t('Select')} {p.make} {p.model}
        </span>
        <input type="checkbox" className="h-4 w-4 accent-brand" checked={checked} onChange={onToggle} />
      </label>
      <div className="relative h-12 w-12 shrink-0">
        {showUrl ? (
          <img src={showUrl} alt="" loading="lazy" className="h-12 w-12 rounded-lg bg-muted object-contain" />
        ) : p.best ? (
          <img src={p.best.url} alt="" loading="lazy" className="h-12 w-12 rounded-lg border border-dashed border-muted-foreground/40 bg-muted object-contain opacity-60" title={t('Suggested')} />
        ) : (
          <div className="grid h-12 w-12 place-items-center rounded-lg bg-muted text-muted-foreground/60">
            <Smartphone className="h-5 w-5" strokeWidth={1.5} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 basis-40">
        <Link to={`/admin/inventory/products?id=${p.id}`} className="block truncate text-sm font-medium hover:text-brand">
          {p.make} {p.model}
        </Link>
        <p className="truncate font-mono text-xs text-muted-foreground">
          {p.modelNumber} · {formatInt(p.variants)} {p.variants === 1 ? t('variant') : t('variants')} · {formatInt(p.stockUnits)} {t('units')}
        </p>
        <div className="mt-1 flex flex-wrap gap-1">
          {issues.map((i) => (
            <span key={i} className={cn('rounded-full px-1.5 py-0.5 text-[0.65rem] font-semibold', ISSUE[i].cls)}>
              {t(ISSUE[i].label)}
            </span>
          ))}
        </div>
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </div>
      <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-1.5 sm:w-auto">
        {needsImage && p.best && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy || working}
            onClick={() => void run(() => attachProductImage(p.id, p.best!.assetId, p.best!.reason === 'exact' ? 'exact' : 'approx'))}
            title={p.best.reason === 'exact' ? undefined : t('Shown in the store as an illustrative image')}
          >
            <Wand2 className="h-4 w-4" strokeWidth={2} />
            {t('Use')} · {t(REASON_LABEL[p.best.reason])}
          </Button>
        )}
        {needsImage && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void run(async () => attachProductImage(p.id, (await uploadToLibrary(f, { make: p.make, model: p.model })).id, 'exact'));
              }}
            />
            <Button size="sm" variant="outline" disabled={busy || working} onClick={() => fileRef.current?.click()} aria-label={`${t('Upload photo')} · ${p.model}`}>
              <ImagePlus className="h-4 w-4" strokeWidth={2} />
              <span className="sm:sr-only">{working ? t('Working…') : t('Upload photo')}</span>
            </Button>
          </>
        )}
        {issues.includes('ready') && (
          <Button size="sm" variant="brand" disabled={busy || working} onClick={onPublish}>
            <Eye className="h-4 w-4" strokeWidth={2} />
            {t('Publish')}
          </Button>
        )}
      </div>
    </li>
  );
}
