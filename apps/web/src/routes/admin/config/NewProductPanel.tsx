import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, X } from 'lucide-react';
import { Panel } from '@/components/admin/parts';
import { Button } from '@/components/ui/Button';
import { createProduct, uploadToLibrary, useActiveLocations, useKnownGrades, useKnownVariantValues, type NewProductInput } from '@/data/imageBank';
import { NEW_OPTION, NewCapacityForm, NewGradeForm, NewLocationForm, capacityOptions, normalizeCapacity } from '@/components/admin/InlineCreate';
import { useAuth } from '@/store';
import { useAdminProducts } from '@/data/products';
import { parseMoneyToCents } from '@/lib/money';
import { ImagePicker, type PickedImage } from './ImagePicker';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

const CARRIERS = [
  { code: 'ATT', label: 'AT&T' },
  { code: 'VZW', label: 'Verizon' },
  { code: 'TMO', label: 'T-Mobile' },
  { code: 'SPR', label: 'Sprint' },
  { code: 'BST', label: 'Boost' },
  { code: 'XFI', label: 'Xfinity' },
  { code: 'SPC', label: 'Spectrum' },
  { code: 'OTH', label: 'Other' },
];

interface VariantDraft {
  key: number;
  capacity: string;
  color: string;
  grade: string;
  /** 'UNL' = unlocked; any other code = locked to that carrier. */
  network: string;
  locationId: string;
  qty: string;
  cost: string;
}

const ERRORS: [string, string][] = [
  ['product_exists', 'A product with this make and model number already exists.'],
  ['duplicate_variant', 'Two variants are the same (capacity, color, grade and network).'],
  ['bad_grade', 'Pick a grade from the list.'],
  ['bad_stock', 'Opening stock needs a quantity of 1 or more and a unit cost.'],
  ['bad_location', 'The chosen location is no longer active.'],
  ['bad_variants', 'Add at least one variant (up to 100).'],
  ['bad_variant', 'Each variant needs a capacity (up to 20 characters).'],
  ['bad_model_number', 'Model number is required (up to 60 characters).'],
  ['bad_model', 'Model is required (up to 120 characters).'],
  ['bad_make', 'Make is required (up to 40 characters).'],
  ['staff_only', 'Only staff or admins can do this.'],
];

const inputCls = 'h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-brand';
const labelCls = 'mb-1.5 block text-xs font-medium text-muted-foreground';

let nextKey = 1;
const blankVariant = (): VariantDraft => ({ key: nextKey++, capacity: '', color: '', grade: '', network: 'UNL', locationId: '', qty: '', cost: '' });

/**
 * Create a product by hand: model data, one row per variant (with optional
 * opening stock), and its image from the bank or an upload. One RPC call
 * (create_product) writes it all or nothing. Starts hidden from the store.
 */
export function NewProductPanel({ onClose, onCreated }: { onClose: () => void; onCreated: (productId: string) => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const products = useAdminProducts();
  const grades = useKnownGrades();
  const locations = useActiveLocations();
  // Grades and locations are admin-only writes (RLS on vendor_grade_map /
  // stock_locations); staff keep the plain pick-from-list.
  const { role } = useAuth();
  const canCreate = role === 'admin';
  // Capacity is free text in the database; "+ New capacity…" only needs the
  // standard spelling, so anyone who can create a product can add one.
  const [creating, setCreating] = useState<{ forKey: number; kind: 'grade' | 'location' | 'capacity' } | null>(null);
  const known = useKnownVariantValues();
  const makes = useMemo(() => [...new Set((products.data ?? []).map((p) => p.make))].sort(), [products.data]);

  const [make, setMake] = useState('');
  // Models already in the catalog for this make, so a new one follows the same
  // naming ("iPhone SE 3", not "SE2").
  const [model, setModel] = useState('');
  const [modelNumber, setModelNumber] = useState('');
  const [category, setCategory] = useState<NewProductInput['category']>('phones');
  const [description, setDescription] = useState('');
  const [published, setPublished] = useState(false);
  const [variants, setVariants] = useState<VariantDraft[]>([blankVariant()]);
  const [image, setImage] = useState<PickedImage | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const models = useMemo(
    () => [...new Set((products.data ?? []).filter((p) => !make.trim() || p.make.toLowerCase() === make.trim().toLowerCase()).map((p) => p.model))].sort(),
    [products.data, make],
  );
  // Standard sizes + sizes already in use + any just added on this form.
  const capacities = useMemo(() => capacityOptions([...(known.data?.capacities ?? []), ...variants.map((v) => v.capacity)]), [known.data, variants]);

  const patch = (key: number, p: Partial<VariantDraft>) => setVariants((vs) => vs.map((v) => (v.key === key ? { ...v, ...p } : v)));

  const stockProblem = variants.some((v) => {
    const any = v.locationId || v.qty.trim() || v.cost.trim();
    if (!any) return false;
    const q = Number(v.qty);
    return !v.locationId || !Number.isInteger(q) || q < 1 || (parseMoneyToCents(v.cost) ?? 0) < 1;
  });
  const ready = make.trim() && model.trim() && modelNumber.trim() && variants.every((v) => v.capacity.trim() && v.grade) && !stockProblem;
  const hasStock = variants.some((v) => v.locationId && v.qty.trim());

  const create = useMutation({
    mutationFn: () =>
      createProduct({
        make: make.trim(),
        model: model.trim(),
        model_number: modelNumber.trim(),
        category,
        description: description.trim(),
        published,
        image_asset_id: image?.assetId ?? null,
        image_mode: image?.mode ?? 'exact',
        variants: variants.map((v) => ({
          capacity: normalizeCapacity(v.capacity),
          color: v.color.trim(),
          grade: v.grade,
          carrier: v.network,
          lock_status: v.network === 'UNL' ? 'unlocked' : 'locked',
          stock: v.locationId && v.qty.trim() ? [{ location_id: v.locationId, qty: Number(v.qty), unit_cost_cents: parseMoneyToCents(v.cost) ?? 0 }] : [],
        })),
      }),
    onSuccess: (id) => {
      void qc.invalidateQueries({ queryKey: ['admin-products'] });
      void qc.invalidateQueries({ queryKey: ['product-health'] });
      void qc.invalidateQueries({ queryKey: ['catalog-listing'] });
      void qc.invalidateQueries({ queryKey: ['admin-inventory'] });
      void qc.invalidateQueries({ queryKey: ['image-suggestions'] });
      onCreated(id);
    },
  });

  async function upload(file: File) {
    setUploadError(null);
    if (!make.trim() || !model.trim()) {
      setUploadError(t('Type the make and model first, so the photo is filed under them.'));
      return;
    }
    setUploading(true);
    try {
      const asset = await uploadToLibrary(file, { make, model });
      setImage({ assetId: asset.id, url: asset.url, mode: 'exact' });
      void qc.invalidateQueries({ queryKey: ['image-suggestions'] });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : t('Upload failed.'));
    } finally {
      setUploading(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (ready && !create.isPending) create.mutate();
  }

  const errorText = create.isError
    ? (() => {
        const hit = ERRORS.find(([code]) => create.error.message.includes(code));
        return hit ? t(hit[1]) : create.error.message;
      })()
    : null;

  return (
    <Panel
      title={t('New product')}
      action={
        <button type="button" onClick={onClose} className="-m-1.5 grid h-11 w-11 place-items-center rounded-full hover:bg-muted" aria-label={t('Close')}>
          <X className="h-4 w-4" />
        </button>
      }
    >
      <form onSubmit={submit} className="space-y-7">
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-3 text-sm font-medium">{t('Model')}</legend>
          <label>
            <span className={labelCls}>{t('Make')}</span>
            <input list="known-makes" value={make} onChange={(e) => setMake(e.target.value)} placeholder="Apple" className={inputCls} maxLength={40} required />
            <datalist id="known-makes">
              {makes.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>
          <label>
            <span className={labelCls}>{t('Model')}</span>
            <input list="known-models" value={model} onChange={(e) => setModel(e.target.value)} placeholder="iPhone 16 Pro" className={inputCls} maxLength={120} required />
            <datalist id="known-models">
              {models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>
          <label>
            <span className={labelCls}>{t('Model number')}</span>
            <input value={modelNumber} onChange={(e) => setModelNumber(e.target.value)} placeholder="A3083" className={cn(inputCls, 'font-mono')} maxLength={60} required />
          </label>
          <label>
            <span className={labelCls}>{t('Category')}</span>
            <select value={category} onChange={(e) => setCategory(e.target.value as NewProductInput['category'])} className={inputCls}>
              <option value="phones">{t('Phones')}</option>
              <option value="accessories">{t('Accessories')}</option>
              <option value="wearables">{t('Wearables')}</option>
            </select>
          </label>
          <label className="sm:col-span-2">
            <span className={labelCls}>{t('Description')} ({t('optional')})</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={4000}
              placeholder={t('What customers should know about this model — condition notes, what is in the box, warranty…')}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand"
            />
          </label>
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-sm font-medium">{t('Photo')}</legend>
          <p className="mb-3 text-xs text-muted-foreground">{t('An image of this exact model is attached by itself. Pick or upload one otherwise.')}</p>
          <ImagePicker
            make={make}
            model={model}
            current={{ url: image?.url ?? null, approx: image?.mode === 'approx' }}
            busy={uploading}
            error={uploadError}
            onPick={setImage}
            onUpload={(f) => void upload(f)}
          />
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-sm font-medium">{t('Variants')}</legend>
          <p className="mb-3 text-xs text-muted-foreground">{t('One row per sellable version. Opening stock is optional; without stock and cost the product has no wholesale price yet.')}</p>
          <ul className="space-y-3">
            {variants.map((v, i) => (
              <li key={v.key} className="rounded-xl border border-border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t('Variant')} {i + 1}
                  </span>
                  {variants.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setVariants((vs) => vs.filter((x) => x.key !== v.key))}
                      className="-m-2 grid h-11 w-11 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-destructive"
                      aria-label={`${t('Remove')} ${t('Variant')} ${i + 1}`}
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={2} />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <label>
                    <span className={labelCls}>{t('Capacity')}</span>
                    <select
                      value={v.capacity}
                      onChange={(e) => {
                        if (e.target.value === NEW_OPTION) setCreating({ forKey: v.key, kind: 'capacity' });
                        else patch(v.key, { capacity: e.target.value });
                      }}
                      className={inputCls}
                      required
                    >
                      <option value="" disabled>
                        {t('Choose')}
                      </option>
                      {capacities.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                      <option value={NEW_OPTION}>+ {t('New capacity…')}</option>
                    </select>
                  </label>
                  <label>
                    <span className={labelCls}>{t('Color')}</span>
                    <input list="known-colors" value={v.color} onChange={(e) => patch(v.key, { color: e.target.value })} placeholder="Black Titanium" className={inputCls} maxLength={40} />
                  </label>
                  <label>
                    <span className={labelCls}>{t('Grade')}</span>
                    <select
                      value={v.grade}
                      onChange={(e) => {
                        if (e.target.value === NEW_OPTION) setCreating({ forKey: v.key, kind: 'grade' });
                        else patch(v.key, { grade: e.target.value });
                      }}
                      className={inputCls}
                      required
                    >
                      <option value="" disabled>
                        {grades.isLoading ? t('Loading…') : t('Choose')}
                      </option>
                      {(grades.data ?? []).map((g) => (
                        <option key={g.grade} value={g.grade}>
                          {g.grade} · CTIA {g.ctia}
                        </option>
                      ))}
                      {canCreate && <option value={NEW_OPTION}>+ {t('New grade…')}</option>}
                    </select>
                  </label>
                  <label>
                    <span className={labelCls}>{t('Network')}</span>
                    <select value={v.network} onChange={(e) => patch(v.key, { network: e.target.value })} className={inputCls}>
                      <option value="UNL">{t('Unlocked')}</option>
                      {CARRIERS.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.label} · {t('Locked')}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_1fr]">
                  <label className="col-span-2 sm:col-span-1">
                    <span className={labelCls}>{t('Opening stock at')}</span>
                    <select
                      value={v.locationId}
                      onChange={(e) => {
                        if (e.target.value === NEW_OPTION) setCreating({ forKey: v.key, kind: 'location' });
                        else patch(v.key, { locationId: e.target.value });
                      }}
                      className={inputCls}
                    >
                      <option value="">{t('No stock yet')}</option>
                      {(locations.data ?? []).map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                      {canCreate && <option value={NEW_OPTION}>+ {t('New location…')}</option>}
                    </select>
                  </label>
                  <label>
                    <span className={labelCls}>{t('Qty')}</span>
                    <input value={v.qty} onChange={(e) => patch(v.key, { qty: e.target.value.replace(/\D/g, '') })} inputMode="numeric" placeholder="0" disabled={!v.locationId} className={cn(inputCls, 'font-mono tabular-nums')} />
                  </label>
                  <label>
                    <span className={labelCls}>{t('Unit cost (USD)')}</span>
                    <input value={v.cost} onChange={(e) => patch(v.key, { cost: e.target.value })} inputMode="decimal" placeholder="0.00" disabled={!v.locationId} className={cn(inputCls, 'font-mono tabular-nums')} />
                  </label>
                </div>
                {creating?.forKey === v.key && creating.kind === 'capacity' && (
                  <NewCapacityForm
                    onCreated={(c) => {
                      patch(v.key, { capacity: c });
                      setCreating(null);
                    }}
                    onCancel={() => setCreating(null)}
                  />
                )}
                {creating?.forKey === v.key && creating.kind === 'grade' && (
                  <NewGradeForm
                    known={(grades.data ?? []).map((g) => g.grade)}
                    onCreated={(g) => {
                      patch(v.key, { grade: g });
                      setCreating(null);
                    }}
                    onCancel={() => setCreating(null)}
                  />
                )}
                {creating?.forKey === v.key && creating.kind === 'location' && (
                  <NewLocationForm
                    onCreated={(row) => {
                      patch(v.key, { locationId: row.id });
                      setCreating(null);
                    }}
                    onCancel={() => setCreating(null)}
                  />
                )}
              </li>
            ))}
          </ul>
          <datalist id="known-colors">
            {(known.data?.colors ?? []).map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-3 min-h-11 sm:min-h-0"
            disabled={variants.length >= 100}
            onClick={() => setVariants((vs) => [...vs, { ...blankVariant(), grade: vs[vs.length - 1]?.grade ?? '', network: vs[vs.length - 1]?.network ?? 'UNL' }])}
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            {t('Add variant')}
          </Button>
        </fieldset>

        <label className="flex items-start gap-3 rounded-xl bg-muted/40 px-3 py-3 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand" checked={published} onChange={(e) => setPublished(e.target.checked)} />
          <span>
            {t('Publish now')}
            <span className="block text-xs text-muted-foreground">
              {hasStock ? t('Customers see it once it has a price for their tier.') : t('Leave it hidden until it has stock and a price.')}
            </span>
          </span>
        </label>

        {stockProblem && <p className="text-sm text-destructive">{t('Opening stock needs a location, a quantity of 1 or more and a unit cost.')}</p>}
        {errorText && (
          <p className="text-sm text-destructive" role="alert">
            {errorText}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button type="submit" variant="brand" disabled={!ready || create.isPending}>
            {create.isPending ? t('Creating…') : t('Create product')}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
