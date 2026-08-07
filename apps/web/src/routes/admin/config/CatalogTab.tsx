import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Plus, Radio, Rocket, X } from 'lucide-react';
import { getAppSetting, setAppSetting } from '@/data/adminConfig';
import { Panel } from '@/components/admin/parts';
import { Button } from '@/components/ui/Button';
import { Field, MutationError, TextInput, Toggle } from './parts';
import { cn } from '@/lib/utils';

type CatalogSource = 'mock' | 'real';
type QtyDisplay = 'exact' | 'ranges';
interface Featured {
  skus: string[];
  models: string[];
}

function useSetting<T>(key: string, fallback: T) {
  return useQuery({ queryKey: ['app_setting', key], queryFn: () => getAppSetting<T>(key, fallback) });
}

/** Typed-confirmation modal for the irreversible-feeling go-live flip. */
function GoLiveModal({ onConfirm, onCancel, busy }: { onConfirm: () => void; onCancel: () => void; busy: boolean }) {
  const [typed, setTyped] = useState('');
  const ok = typed.trim().toUpperCase() === 'GO LIVE';
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-lg">
        <div className="flex items-start gap-3">
          <span className="text-brand">
            <Rocket className="h-5 w-5" strokeWidth={2} />
          </span>
          <div>
            <h2 className="text-sm font-semibold">Switch the storefront to the real catalog?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Every visitor will immediately see live, priced, in-stock inventory instead of the demo catalog. Make sure prices and stock are
              correct first. Type <span className="font-mono font-semibold">GO LIVE</span> to confirm.
            </p>
          </div>
        </div>
        <input
          autoFocus
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="GO LIVE"
          className="mt-4 h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm outline-none focus:border-brand"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" variant="brand" size="sm" disabled={!ok || busy} onClick={onConfirm}>
            {busy ? 'Going live…' : 'Go live'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Editable string-list (featured SKUs / models). */
function ListEditor({ label, help, values, onChange, disabled }: { label: string; help: string; values: string[]; onChange: (next: string[]) => void; disabled?: boolean }) {
  const [draft, setDraft] = useState('');
  return (
    <Field label={label} help={help}>
      <div className="flex flex-wrap gap-2">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium">
            {v}
            {!disabled && (
              <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))} className="text-muted-foreground hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
        {values.length === 0 && <span className="text-xs text-muted-foreground">None pinned.</span>}
      </div>
      {!disabled && (
        <div className="mt-2 flex gap-2">
          <TextInput
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add and press +"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const v = draft.trim();
                if (v && !values.includes(v)) onChange([...values, v]);
                setDraft('');
              }
            }}
            className="h-10"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const v = draft.trim();
              if (v && !values.includes(v)) onChange([...values, v]);
              setDraft('');
            }}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      )}
    </Field>
  );
}

export default function CatalogTab() {
  const qc = useQueryClient();
  const sourceQ = useSetting<CatalogSource>('catalog_source', 'mock');
  const qtyQ = useSetting<QtyDisplay>('catalog_qty_display', 'exact');
  const featuredQ = useSetting<Featured>('catalog_featured', { skus: [], models: [] });
  const [goLiveOpen, setGoLiveOpen] = useState(false);

  const save = useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) => setAppSetting(key, value),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['app_setting', v.key] }),
  });

  const source = sourceQ.data ?? 'mock';
  const qty = qtyQ.data ?? 'exact';
  const featured = featuredQ.data ?? { skus: [], models: [] };
  const isLive = source === 'real';

  return (
    <div className="space-y-6">
      {/* The big go-live switch */}
      <section className={cn('rounded-2xl border p-5', isLive ? 'border-success/40 bg-success/5' : 'border-brand/30 bg-brand/5')}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className={isLive ? 'text-success' : 'text-brand'}>
              <Rocket className="h-6 w-6" strokeWidth={2} />
            </span>
            <div>
              <h2 className="text-base font-semibold">Storefront catalog source</h2>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                {isLive
                  ? 'LIVE — the storefront shows real, priced, in-stock inventory. Flip back to demo to hide it again.'
                  : 'Demo — the storefront shows the polished mock catalog. Nothing real is exposed yet. Flip to LIVE when prices and stock are ready.'}
              </p>
              <span
                className={cn(
                  'mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
                  isLive ? 'bg-success/15 text-success' : 'bg-brand/15 text-brand',
                )}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', isLive ? 'bg-success' : 'bg-brand')} />
                {isLive ? 'Live catalog' : 'Demo catalog'}
              </span>
            </div>
          </div>
          {isLive ? (
            <Button variant="outline" size="sm" disabled={save.isPending} onClick={() => save.mutate({ key: 'catalog_source', value: 'mock' })}>
              Switch back to demo
            </Button>
          ) : (
            <Button variant="brand" size="md" disabled={save.isPending} onClick={() => setGoLiveOpen(true)}>
              <Rocket className="h-4 w-4" strokeWidth={2} />
              Go live
            </Button>
          )}
        </div>
        <MutationError error={save.error} />
      </section>

      {goLiveOpen && (
        <GoLiveModal
          busy={save.isPending}
          onCancel={() => setGoLiveOpen(false)}
          onConfirm={() =>
            save.mutate(
              { key: 'catalog_source', value: 'real' },
              { onSuccess: () => setGoLiveOpen(false) },
            )
          }
        />
      )}

      {/* Quantity display */}
      <Panel title="Stock quantity display">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Show exact quantities</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {qty === 'exact' ? 'Customers see the exact unit count per location (locked default D2).' : 'Customers see ranges (e.g. “50+”) instead of exact counts.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Ranges</span>
            <Toggle
              label="Exact quantities"
              checked={qty === 'exact'}
              onChange={(next) => save.mutate({ key: 'catalog_qty_display', value: next ? 'exact' : 'ranges' })}
            />
            <span className="text-xs text-muted-foreground">Exact</span>
          </div>
        </div>
      </Panel>

      {/* Featured curation */}
      <Panel title="Featured sort curation" action={<AlertTriangle className="hidden h-4 w-4 text-muted-foreground sm:block" />}>
        <p className="mb-4 text-sm text-muted-foreground">
          Pin SKUs or model names to the top of the “Featured” sort. Empty = the storefront’s default ordering.
        </p>
        <div className="grid gap-5 sm:grid-cols-2">
          <ListEditor
            label="Pinned SKUs"
            help="Exact variant SKUs to feature first."
            values={featured.skus}
            onChange={(skus) => save.mutate({ key: 'catalog_featured', value: { ...featured, skus } })}
          />
          <ListEditor
            label="Pinned models"
            help="Model names (e.g. “iPhone 15 Pro”) to feature."
            values={featured.models}
            onChange={(models) => save.mutate({ key: 'catalog_featured', value: { ...featured, models } })}
          />
        </div>
      </Panel>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Radio className="h-3.5 w-3.5" /> Catalog & display settings are admin/staff-editable and stored in app_settings.
      </p>
    </div>
  );
}
