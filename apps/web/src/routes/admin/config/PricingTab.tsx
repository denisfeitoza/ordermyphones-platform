import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { listPricingSettings, setPricingSetting, type PricingSettingRow } from '@/data/adminConfig';
import { CTIA_GRADES, PRICING_KEY_META, validatePricingValue, type Band } from '@/lib/pricingSettings';
import { useAuth } from '@/store';
import { Panel } from '@/components/admin/parts';
import { Button } from '@/components/ui/Button';
import { formatUsd } from '@/lib/format';
import { useI18n } from '@/i18n';
import { AdminOnlyNote, MoneyCentsInput, MutationError, TextInput } from './parts';

// A single illustrative cost so every rule shows a live, concrete effect.
const SAMPLE = 30000; // $300
const usd = (c: number) => formatUsd(Math.round(c));
const num = (v: unknown, fb = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fb);

/** One rule: plain title, one-line explanation, the control, a live worked
 * example, and an inline Save that only appears when the value changed. */
function Rule({
  title,
  blurb,
  example,
  dirty,
  invalid,
  invalidMsg,
  canEdit,
  onSave,
  children,
}: {
  title: string;
  blurb: string;
  example: string;
  dirty: boolean;
  invalid: boolean;
  invalidMsg?: string;
  canEdit: boolean;
  onSave: () => void;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="rounded-xl border border-border p-4">
      <p className="text-sm font-medium">{t(title)}</p>
      <p className="mt-0.5 text-sm text-muted-foreground">{t(blurb)}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {children}
        {canEdit && dirty && (
          <Button size="sm" variant="outline" disabled={invalid} onClick={onSave} className="active:scale-[0.98]">
            {t('Save')}
          </Button>
        )}
        {invalid && invalidMsg && <span className="text-xs text-destructive">{t(invalidMsg)}</span>}
      </div>
      <p className="mt-2 rounded-lg bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
        <span className="font-medium text-foreground/70">{t('Example')}:</span> {example}
      </p>
    </div>
  );
}

function PercentInput({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  const pct = Math.round(value * 1000) / 10;
  return (
    <div className="relative w-28">
      <TextInput
        type="number"
        step="0.5"
        min="0"
        max="100"
        value={pct}
        disabled={disabled}
        onChange={(e) => onChange(Math.min(1, Math.max(0, (Number(e.target.value) || 0) / 100)))}
        className="pr-7 text-right"
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
    </div>
  );
}

/** cost×(1+cap) style rules: caps, discounts, review triggers, trim. */
function PercentRule({
  metaKey,
  title,
  blurb,
  value,
  canEdit,
  onSave,
  example,
}: {
  metaKey: string;
  title: string;
  blurb: string;
  value: unknown;
  canEdit: boolean;
  onSave: (v: number) => void;
  example: (v: number) => string;
}) {
  const [draft, setDraft] = useState(num(value));
  useEffect(() => setDraft(num(value)), [value]);
  const invalid = !!validatePricingValue(PRICING_KEY_META[metaKey].kind, draft);
  return (
    <Rule title={title} blurb={blurb} example={example(draft)} dirty={draft !== value} invalid={invalid} invalidMsg="Must be between 0 and 100%." canEdit={canEdit} onSave={() => onSave(draft)}>
      <PercentInput value={draft} disabled={!canEdit} onChange={setDraft} />
    </Rule>
  );
}

function MoneyRule({ metaKey, title, blurb, value, canEdit, onSave, example }: { metaKey: string; title: string; blurb: string; value: unknown; canEdit: boolean; onSave: (v: number) => void; example: (v: number) => string }) {
  const [draft, setDraft] = useState(num(value));
  useEffect(() => setDraft(num(value)), [value]);
  const invalid = !!validatePricingValue(PRICING_KEY_META[metaKey].kind, draft);
  return (
    <Rule title={title} blurb={blurb} example={example(draft)} dirty={draft !== value} invalid={invalid} invalidMsg="Must be a whole dollar amount." canEdit={canEdit} onSave={() => onSave(draft)}>
      <div className="w-32">
        <MoneyCentsInput ariaLabel={title} cents={draft} disabled={!canEdit} onChange={setDraft} />
      </div>
    </Rule>
  );
}

function IntRule({ metaKey, title, blurb, value, canEdit, onSave, example }: { metaKey: string; title: string; blurb: string; value: unknown; canEdit: boolean; onSave: (v: number) => void; example: (v: number) => string }) {
  const [draft, setDraft] = useState(num(value, 1));
  useEffect(() => setDraft(num(value, 1)), [value]);
  const invalid = !!validatePricingValue(PRICING_KEY_META[metaKey].kind, draft);
  return (
    <Rule title={title} blurb={blurb} example={example(draft)} dirty={draft !== value} invalid={invalid} invalidMsg="Must be a whole number ≥ 1." canEdit={canEdit} onSave={() => onSave(draft)}>
      <div className="w-24">
        <TextInput type="number" min="1" step="1" value={draft} disabled={!canEdit} aria-label={title} onChange={(e) => setDraft(Math.max(1, Math.floor(Number(e.target.value) || 1)))} className="text-right" />
      </div>
    </Rule>
  );
}

function MultiplierRule({ metaKey, title, blurb, value, canEdit, onSave, example }: { metaKey: string; title: string; blurb: string; value: unknown; canEdit: boolean; onSave: (v: number) => void; example: (v: number) => string }) {
  const [draft, setDraft] = useState(num(value, 1.1));
  useEffect(() => setDraft(num(value, 1.1)), [value]);
  const invalid = !!validatePricingValue(PRICING_KEY_META[metaKey].kind, draft);
  return (
    <Rule title={title} blurb={blurb} example={example(draft)} dirty={draft !== value} invalid={invalid} invalidMsg="Must be greater than 1." canEdit={canEdit} onSave={() => onSave(draft)}>
      <div className="relative w-28">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">×</span>
        <TextInput type="number" step="0.05" min="1.01" value={draft} disabled={!canEdit} aria-label={title} onChange={(e) => setDraft(Number(e.target.value) || 1)} className="pl-7 text-right" />
      </div>
    </Rule>
  );
}

/** Structured markup-band editor — replaces the raw-JSON textarea. Each row is
 * "cost up to $X → sell at cost + $Y"; the last row is the unbounded top band. */
function BandsEditor({ title, blurb, value, canEdit, onSave }: { title: string; blurb: string; value: unknown; canEdit: boolean; onSave: (v: Band[]) => void }) {
  const { t } = useI18n();
  const initial = (Array.isArray(value) ? value : []) as Band[];
  const [rows, setRows] = useState<Band[]>(initial);
  useEffect(() => setRows((Array.isArray(value) ? value : []) as Band[]), [value]);

  const dirty = JSON.stringify(rows) !== JSON.stringify(initial);
  const error = validatePricingValue('bands', rows);

  const setRow = (i: number, patch: Partial<Band>) => setRows((r) => r.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const addRow = () => {
    // Insert a new bounded band before the unbounded (last) one.
    setRows((r) => {
      const last = r[r.length - 1];
      const prevMax = r.length >= 2 ? (r[r.length - 2].max_cost_cents ?? 0) : 0;
      const newBand: Band = { max_cost_cents: prevMax + 10000, markup_cents: last?.markup_cents ?? 3000 };
      return [...r.slice(0, -1), newBand, last ?? { max_cost_cents: null, markup_cents: 5000 }];
    });
  };
  const removeRow = (i: number) => setRows((r) => r.filter((_, j) => j !== i));

  return (
    <Panel title={t(title)}>
      <p className="mb-4 text-sm text-muted-foreground">{t(blurb)}</p>
      <div className="space-y-2">
        {rows.map((b, i) => {
          const isLast = i === rows.length - 1;
          const sampleSell = SAMPLE + num(b.markup_cents);
          return (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3">
              <span className="text-sm text-muted-foreground">{isLast ? t('Cost above the last band') : t('Cost up to')}</span>
              {!isLast && (
                <div className="w-28">
                  <MoneyCentsInput ariaLabel={t('Cost up to')} cents={num(b.max_cost_cents)} disabled={!canEdit} onChange={(c) => setRow(i, { max_cost_cents: c })} />
                </div>
              )}
              <span className="text-sm text-muted-foreground">{t('→ sell at cost +')}</span>
              <div className="w-28">
                <MoneyCentsInput ariaLabel={t('markup')} cents={num(b.markup_cents)} disabled={!canEdit} onChange={(c) => setRow(i, { markup_cents: c })} />
              </div>
              <span className="ml-auto text-xs text-muted-foreground">
                {t('a')} {usd(SAMPLE)} {t('phone')} → {usd(sampleSell)}
              </span>
              {canEdit && !isLast && rows.length > 1 && (
                <button type="button" onClick={() => removeRow(i)} aria-label={t('Remove')} className="text-muted-foreground transition-colors hover:text-destructive">
                  <Trash2 className="h-4 w-4" strokeWidth={2} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {canEdit && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button size="sm" variant="ghost" onClick={addRow} className="active:scale-[0.98]">
            <Plus className="h-4 w-4" strokeWidth={2} />
            {t('Add a band')}
          </Button>
          <Button size="sm" variant="outline" disabled={!dirty || !!error} onClick={() => onSave(rows)} className="active:scale-[0.98]">
            {t('Save bands')}
          </Button>
          {error && dirty && <span className="text-xs text-destructive">{error}</span>}
        </div>
      )}
    </Panel>
  );
}

/** Structured per-grade multiplier editor — replaces the raw-JSON object. */
function MultipliersEditor({ title, blurb, value, canEdit, onSave }: { title: string; blurb: string; value: unknown; canEdit: boolean; onSave: (v: Record<string, number>) => void }) {
  const { t } = useI18n();
  const initial = (value && typeof value === 'object' ? value : {}) as Record<string, number>;
  const [draft, setDraft] = useState<Record<string, number>>(initial);
  useEffect(() => setDraft((value && typeof value === 'object' ? value : {}) as Record<string, number>), [value]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const error = validatePricingValue('multipliers', draft);

  return (
    <Panel title={t(title)}>
      <p className="mb-4 text-sm text-muted-foreground">{t(blurb)}</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {CTIA_GRADES.map((g) => {
          const v = num(draft[g], 1.1);
          return (
            <div key={g} className="flex items-center gap-2 rounded-xl border border-border p-3">
              <span className="w-10 font-mono text-sm font-medium">{g}</span>
              <div className="relative w-24">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">×</span>
                <TextInput type="number" step="0.05" min="1.01" value={v} disabled={!canEdit} aria-label={`${g} multiplier`} onChange={(e) => setDraft((d) => ({ ...d, [g]: Number(e.target.value) || 1 }))} className="pl-7 text-right" />
              </div>
              <span className="ml-auto text-xs text-muted-foreground">{usd(SAMPLE)} → {usd(SAMPLE * v)}</span>
            </div>
          );
        })}
      </div>
      {canEdit && (
        <div className="mt-3 flex items-center gap-3">
          <Button size="sm" variant="outline" disabled={!dirty || !!error} onClick={() => onSave(draft)} className="active:scale-[0.98]">
            {t('Save multipliers')}
          </Button>
          {error && dirty && <span className="text-xs text-destructive">{error}</span>}
        </div>
      )}
    </Panel>
  );
}

export default function PricingTab() {
  const { t } = useI18n();
  const { role } = useAuth();
  const canEdit = role === 'admin';
  const qc = useQueryClient();
  const settingsQ = useQuery({ queryKey: ['config-pricing'], queryFn: listPricingSettings });

  const save = useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) => setPricingSetting(key, value),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config-pricing'] }),
  });

  const byKey = new Map<string, PricingSettingRow>((settingsQ.data ?? []).map((r) => [r.key, r]));
  const v = (k: string) => byKey.get(k)?.value;
  const put = (key: string) => (value: unknown) => save.mutate({ key, value });

  return (
    <div className="space-y-6">
      <AdminOnlyNote show={!canEdit} />

      <div className="rounded-2xl border border-brand/20 bg-brand/5 p-4 text-sm text-muted-foreground">
        {t('These rules power the automatic pricing. Change a number and Save — then run')} <span className="font-medium text-foreground">{t('Reprice all')}</span> {t('on the Tiers & floors tab to apply it to existing stock. Every rule below shows a live example on a')} <span className="font-medium text-foreground">{usd(SAMPLE)}</span> {t('phone.')}
      </div>

      {settingsQ.isLoading && <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">{t('Loading pricing parameters…')}</div>}
      {settingsQ.isError && <MutationError error={settingsQ.error} />}
      <MutationError error={save.error} />

      {settingsQ.data && (
        <>
          <Panel title={t('Markup caps (wholesale & distributor)')}>
            <div className="space-y-3">
              <PercentRule metaKey="wholesale_pct_cap" title="Wholesale markup cap" blurb="The most Wholesale can ever be marked up over cost." value={v('wholesale_pct_cap')} canEdit={canEdit} onSave={put('wholesale_pct_cap')} example={(x) => `${usd(SAMPLE)} ${t('cost')} → ${t('at most')} ${usd(SAMPLE * (1 + x))} (${t('markup capped at')} ${usd(SAMPLE * x)})`} />
              <PercentRule metaKey="distributor_pct_cap" title="Distributor markup cap" blurb="The most Distributor can ever be marked up over cost." value={v('distributor_pct_cap')} canEdit={canEdit} onSave={put('distributor_pct_cap')} example={(x) => `${usd(SAMPLE)} ${t('cost')} → ${t('at most')} ${usd(SAMPLE * (1 + x))} (${t('markup capped at')} ${usd(SAMPLE * x)})`} />
            </div>
          </Panel>

          <BandsEditor title="Wholesale markup bands" blurb="The exact dollar markup Wholesale adds, by how much the phone costs you. Cheaper phones usually get a bigger % markup, pricier ones a smaller one. Bands go cheapest → most expensive; the last band covers everything above." value={v('wholesale_bands')} canEdit={canEdit} onSave={put('wholesale_bands')} />
          <BandsEditor title="Distributor markup bands" blurb="Same idea as wholesale bands, but for the Distributor tier." value={v('distributor_bands')} canEdit={canEdit} onSave={put('distributor_bands')} />

          <MultipliersEditor title="Condition multipliers" blurb="When there's no market benchmark for a phone yet, price it as cost × this multiplier, by its condition grade (NEW is best, D is worst). Higher grade = higher multiplier." value={v('fallback_multipliers')} canEdit={canEdit} onSave={put('fallback_multipliers')} />

          <Panel title={t('Discounts & fallback')}>
            <div className="space-y-3">
              <PercentRule metaKey="locked_discount" title="Carrier-locked discount" blurb="Carrier-locked phones are worth less, so knock a percentage off. (Stored as a multiplier; shown here as the % off.)" value={typeof v('locked_discount') === 'number' ? 1 - (v('locked_discount') as number) : 0} canEdit={canEdit} onSave={(x) => put('locked_discount')(Math.round((1 - x) * 1000) / 1000)} example={(x) => `${t('a')} ${usd(SAMPLE)} ${t('unlocked price')} → ${usd(SAMPLE * (1 - x))} ${t('locked')} (−${Math.round(x * 100)}%)`} />
              <MultiplierRule metaKey="fallback_default_multiplier" title="Default fallback multiplier" blurb="Last resort: when no grade-specific rule applies, price = cost × this." value={v('fallback_default_multiplier')} canEdit={canEdit} onSave={put('fallback_default_multiplier')} example={(x) => `${usd(SAMPLE)} ${t('cost')} → ${usd(SAMPLE * x)}`} />
            </div>
          </Panel>

          <Panel title={t('Profit floor & review triggers')}>
            <div className="space-y-3">
              <MoneyRule metaKey="retailer_min_margin_cents" title="Retailer minimum profit" blurb="A Retailer price must clear at least this much profit, or the item is hidden from retailers." value={v('retailer_min_margin_cents')} canEdit={canEdit} onSave={put('retailer_min_margin_cents')} example={(x) => `${t('a Retailer item making less than')} ${usd(x)} ${t('profit is hidden until repriced')}`} />
              <PercentRule metaKey="cost_change_review_pct" title="Cost-swing review" blurb="If a supplier's cost jumps by more than this, hold the new price for your review instead of publishing it." value={v('cost_change_review_pct')} canEdit={canEdit} onSave={put('cost_change_review_pct')} example={(x) => `${t('a cost move over')} ${Math.round(x * 100)}% ${t('holds the price for review')}`} />
              <IntRule metaKey="min_sources_high_confidence" title="Sources for a trusted price" blurb="How many independent cost sources a benchmark needs before it's treated as high-confidence." value={v('min_sources_high_confidence')} canEdit={canEdit} onSave={put('min_sources_high_confidence')} example={(x) => `${t('a benchmark needs')} ${x} ${t('sources to be trusted')}`} />
              <PercentRule metaKey="outlier_trim_pct" title="Outlier trim" blurb="Before averaging cost samples, drop this share of the highest and lowest ones so a single weird price doesn't skew the benchmark." value={v('outlier_trim_pct')} canEdit={canEdit} onSave={put('outlier_trim_pct')} example={(x) => `${t('drops the top & bottom')} ${Math.round(x * 100)}% ${t('of cost samples')}`} />
            </div>
          </Panel>

          <details className="rounded-2xl border border-border bg-card">
            <summary className="cursor-pointer px-5 py-3 text-sm font-medium">{t('Advanced — kitting basis (rarely changed)')}</summary>
            <div className="space-y-3 border-t border-border p-5">
              <MoneyRule metaKey="premium_cost_threshold_cents" title="Premium threshold" blurb="Phones costing at or above this are treated as “premium” when choosing a band." value={v('premium_cost_threshold_cents')} canEdit={canEdit} onSave={put('premium_cost_threshold_cents')} example={(x) => `${t('a phone costing')} ${usd(x)}+ ${t('counts as premium')}`} />
              <MoneyRule metaKey="kit_premium_threshold_cents" title="Kit premium threshold" blurb="Cost at or above which the premium kit cost is added to the T1/T2 basis." value={v('kit_premium_threshold_cents')} canEdit={canEdit} onSave={put('kit_premium_threshold_cents')} example={(x) => `${t('at')} ${usd(x)}+ ${t('the premium kit cost applies')}`} />
              <MoneyRule metaKey="kit_cost_premium_cents" title="Kit cost — premium" blurb="Extra cost added to the consumer/retailer basis for premium devices." value={v('kit_cost_premium_cents')} canEdit={canEdit} onSave={put('kit_cost_premium_cents')} example={(x) => `${t('adds')} ${usd(x)} ${t('to a premium device’s basis')}`} />
              <MoneyRule metaKey="kit_cost_standard_cents" title="Kit cost — standard" blurb="Extra cost added to the consumer/retailer basis for standard devices." value={v('kit_cost_standard_cents')} canEdit={canEdit} onSave={put('kit_cost_standard_cents')} example={(x) => `${t('adds')} ${usd(x)} ${t('to a standard device’s basis')}`} />
            </div>
          </details>
        </>
      )}
    </div>
  );
}
