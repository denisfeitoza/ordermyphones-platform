import { useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, ImagePlus, Search, Smartphone, X } from 'lucide-react';
import { useAdminProducts, useUpdateProduct, useUploadProductPhoto, type AdminProduct } from '@/data/products';
import { Panel } from '@/components/admin/parts';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

/**
 * Admin → Inventory → Products (v1.0 plan S2 "CRUD de produto"): products are
 * created by the import; here staff add what a spreadsheet can't carry — a
 * photo, a description and a publish switch. Unpublished products vanish from
 * the storefront listing (catalog_listing filters on products.published)
 * without touching stock or prices.
 */
export default function ProductsTab() {
  const { t } = useI18n();
  const q = useAdminProducts();
  const update = useUpdateProduct();
  const [query, setQuery] = useState('');
  const [onlyUnpublished, setOnlyUnpublished] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const all = q.data ?? [];
    const needle = query.trim().toLowerCase();
    return all.filter((p) => {
      if (onlyUnpublished && p.published) return false;
      if (!needle) return true;
      return `${p.make} ${p.model} ${p.modelNumber} ${p.category}`.toLowerCase().includes(needle);
    });
  }, [q.data, query, onlyUnpublished]);

  const selected = useMemo(() => (q.data ?? []).find((p) => p.id === selectedId) ?? null, [q.data, selectedId]);
  const total = q.data?.length ?? 0;
  const unpublished = (q.data ?? []).filter((p) => !p.published).length;
  const withPhoto = (q.data ?? []).filter((p) => !!p.imageUrl).length;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-brand/20 bg-brand/5 px-4 py-3 text-sm text-muted-foreground">
        <b className="text-foreground">{t('What this is')}:</b>{' '}
        {t('Products arrive from the stock import. Here you add the photo, the description customers read, and switch a product off the storefront without touching stock or prices.')}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: t('Products'), value: total },
          { label: t('With photo'), value: withPhoto },
          { label: t('Hidden from store'), value: unpublished },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>

      <div className={cn('grid gap-6', selected && 'lg:grid-cols-[1fr_380px]')}>
        <Panel title={t('Products')}>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <label className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={2} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('Search make, model or model number…')}
                className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-brand"
                aria-label={t('Search products')}
              />
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-brand" checked={onlyUnpublished} onChange={(e) => setOnlyUnpublished(e.target.checked)} />
              {t('Hidden only')}
            </label>
          </div>

          {q.isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('Loading…')}</p>
          ) : q.isError ? (
            <p className="py-8 text-center text-sm text-destructive">{(q.error as Error).message}</p>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('No products match.')}</p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {rows.slice(0, 200).map((p) => (
                <li
                  key={p.id}
                  className={cn('flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-muted/40', selectedId === p.id && 'bg-muted/60')}
                  onClick={() => setSelectedId(p.id)}
                >
                  <Thumb url={p.imageUrl} alt={p.model} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {p.make} {p.model}
                    </p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {p.modelNumber} · {p.variantCount} {p.variantCount === 1 ? t('variant') : t('variants')} · {p.category}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      update.mutate({ id: p.id, patch: { published: !p.published } });
                    }}
                    disabled={update.isPending}
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
                      p.published ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-muted text-muted-foreground',
                    )}
                    title={p.published ? t('Visible in the store — click to hide') : t('Hidden from the store — click to publish')}
                  >
                    {p.published ? <Eye className="h-3.5 w-3.5" strokeWidth={2} /> : <EyeOff className="h-3.5 w-3.5" strokeWidth={2} />}
                    {p.published ? t('Published') : t('Hidden')}
                  </button>
                </li>
              ))}
              {rows.length > 200 && <li className="px-3 py-2 text-xs text-muted-foreground">{t('Showing the first 200 — narrow the search to see more.')}</li>}
            </ul>
          )}
        </Panel>

        {selected && <ProductEditor key={selected.id} product={selected} onClose={() => setSelectedId(null)} />}
      </div>
    </div>
  );
}

function Thumb({ url, alt, size = 'h-10 w-10' }: { url: string | null; alt: string; size?: string }) {
  return url ? (
    <img src={url} alt={alt} className={cn(size, 'shrink-0 rounded-lg object-cover bg-muted')} loading="lazy" />
  ) : (
    <div className={cn(size, 'grid shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground/60')}>
      <Smartphone className="h-5 w-5" strokeWidth={1.5} />
    </div>
  );
}

function ProductEditor({ product, onClose }: { product: AdminProduct; onClose: () => void }) {
  const { t } = useI18n();
  const update = useUpdateProduct();
  const upload = useUploadProductPhoto();
  const fileRef = useRef<HTMLInputElement>(null);
  const [description, setDescription] = useState(product.description ?? '');
  const dirty = description !== (product.description ?? '');

  return (
    <Panel
      title={`${product.make} ${product.model}`}
      action={
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full hover:bg-muted" aria-label={t('Close')}>
          <X className="h-4 w-4" />
        </button>
      }
    >
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('Photo')}</p>
          <div className="flex items-center gap-4">
            <Thumb url={product.imageUrl} alt={product.model} size="h-24 w-24" />
            <div className="space-y-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) upload.mutate({ id: product.id, file: f });
                  e.target.value = '';
                }}
              />
              <Button size="sm" variant="outline" disabled={upload.isPending} onClick={() => fileRef.current?.click()}>
                <ImagePlus className="h-4 w-4" strokeWidth={2} />
                {upload.isPending ? t('Uploading…') : product.imageUrl ? t('Replace photo') : t('Upload photo')}
              </Button>
              <p className="text-xs text-muted-foreground">{t('JPG, PNG or WebP · up to 5 MB · shown on every variant of this model.')}</p>
              {upload.isError && <p className="text-xs text-destructive">{(upload.error as Error).message}</p>}
            </div>
          </div>
        </div>

        <label className="block">
          <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('Description')}</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            placeholder={t('What customers should know about this model — condition notes, what is in the box, warranty…')}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>

        <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 px-3 py-2.5 text-sm">
          <span>{product.published ? t('Visible in the store') : t('Hidden from the store')}</span>
          <Button size="sm" variant="outline" disabled={update.isPending} onClick={() => update.mutate({ id: product.id, patch: { published: !product.published } })}>
            {product.published ? t('Hide') : t('Publish')}
          </Button>
        </div>

        {update.isError && <p className="text-xs text-destructive">{(update.error as Error).message}</p>}

        <div className="flex gap-2">
          <Button
            variant="primary"
            className="flex-1"
            disabled={!dirty || update.isPending}
            onClick={() => update.mutate({ id: product.id, patch: { description: description.trim() || null } })}
          >
            {update.isPending ? t('Saving…') : t('Save description')}
          </Button>
          <Button variant="outline" disabled={!dirty || update.isPending} onClick={() => setDescription(product.description ?? '')}>
            {t('Reset')}
          </Button>
        </div>
      </div>
    </Panel>
  );
}
