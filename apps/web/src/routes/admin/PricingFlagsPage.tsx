import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { AdminHeading, Panel, Table, Td } from '@/components/admin/parts';
import { Button } from '@/components/ui/Button';
import { formatUsd } from '@/lib/format';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

type DbTier = 'consumer' | 'retailer' | 'wholesale' | 'distributor';
type FlagKind = 'cost_swing' | 'margin' | 'unbenchmarked' | 'tier_order' | 'spread' | 'collision' | 'zero_qty';
type FlagAction = 'override' | 'acknowledge' | 'watch' | 'resolve';

const KIND_LABEL: Record<FlagKind, string> = {
  cost_swing: 'Cost swing',
  margin: 'Margin floor',
  unbenchmarked: 'Unbenchmarked',
  tier_order: 'Tier-order violation',
  spread: 'Cross-location spread',
  collision: 'Multi-vendor collision',
  zero_qty: 'Zero stock',
};

const TIER_LABEL: Record<DbTier, string> = {
  consumer: 'Consumer',
  retailer: 'Retailer',
  wholesale: 'Wholesale',
  distributor: 'Distributor',
};

/** Raw shape of the nested PostgREST select — mirrors the query below by hand (same convention as InventoryPage / PricesPage). */
interface RawFlagRow {
  id: string;
  variant_id: string;
  tier: DbTier | null;
  kind: FlagKind;
  payload: Record<string, unknown>;
  status: string;
  created_at: string;
  variant: {
    sku: string;
    product: { make: string; model: string } | null;
  } | null;
}

export interface FlagRow {
  id: string;
  variantId: string;
  tier: DbTier | null;
  kind: FlagKind;
  payload: Record<string, unknown>;
  createdAt: string;
  sku: string;
  make: string;
  model: string;
}

function toFlagRow(r: RawFlagRow): FlagRow | null {
  if (!r.variant || !r.variant.product) return null;
  return {
    id: r.id,
    variantId: r.variant_id,
    tier: r.tier,
    kind: r.kind,
    payload: r.payload ?? {},
    createdAt: r.created_at,
    sku: r.variant.sku,
    make: r.variant.product.make,
    model: r.variant.product.model,
  };
}

const ROW_LIMIT = 500;

async function fetchOpenFlags(): Promise<FlagRow[]> {
  const { data, error } = await supabase
    .from('pricing_flags')
    .select(
      `id, variant_id, tier, kind, payload, status, created_at,
       variant:product_variants ( sku, product:products ( make, model ) )`,
    )
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(ROW_LIMIT);

  if (error) throw error;
  return ((data ?? []) as unknown as RawFlagRow[]).map(toFlagRow).filter((r): r is FlagRow => r !== null);
}

function formatAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** cents-suffixed keys render as money; everything else renders verbatim. Unknown payload shapes degrade gracefully rather than crashing on an unexpected kind. */
function summarizePayload(payload: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(payload)) {
    if (value === null || value === undefined) continue;
    const label = key.replace(/_cents$/, '').replace(/_/g, ' ');
    if (typeof value === 'number' && key.endsWith('_cents')) {
      parts.push(`${label}: ${formatUsd(value)}`);
    } else {
      parts.push(`${label}: ${String(value)}`);
    }
  }
  return parts.length ? parts.join(' · ') : '—';
}

/** Each flag row owns its own mutation instance — keeps pending/error state scoped to that row instead of a single queue-wide mutation. */
function FlagActions({ flag, onResolved }: { flag: FlagRow; onResolved: () => void }) {
  const { t } = useI18n();
  const [overriding, setOverriding] = useState(false);
  const [priceInput, setPriceInput] = useState('');
  const [expiryDays, setExpiryDays] = useState('30');
  const [formErr, setFormErr] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (vars: { action: FlagAction; overridePriceCents?: number; expiryDays?: number }) => {
      const { error } = await supabase.rpc('resolve_pricing_flag', {
        p_flag_id: flag.id,
        p_action: vars.action,
        p_override_price_cents: vars.overridePriceCents ?? null,
        p_expiry_days: vars.expiryDays ?? 30,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setOverriding(false);
      onResolved();
    },
  });

  function submitOverride(e: FormEvent) {
    e.preventDefault();
    const cents = Math.round(Number(priceInput) * 100);
    const days = Number(expiryDays);
    if (!priceInput.trim() || !Number.isFinite(cents) || cents <= 0) {
      setFormErr(t('Enter a positive $ amount'));
      return;
    }
    if (!Number.isFinite(days) || days <= 0) {
      setFormErr(t('Expiry must be a positive number of days'));
      return;
    }
    setFormErr(null);
    mutation.mutate({ action: 'override', overridePriceCents: cents, expiryDays: days });
  }

  if (overriding) {
    return (
      <form onSubmit={submitOverride} className="flex flex-wrap items-center justify-end gap-1.5">
        <span className="text-xs text-muted-foreground">$</span>
        <input
          type="number"
          inputMode="decimal"
          min="0.01"
          step="0.01"
          value={priceInput}
          onChange={(e) => setPriceInput(e.target.value)}
          placeholder="0.00"
          aria-label={t('Override price')}
          disabled={mutation.isPending}
          className="h-8 w-20 rounded-md border border-border bg-background px-2 text-xs tabular-nums outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        />
        <input
          type="number"
          inputMode="numeric"
          min="1"
          step="1"
          value={expiryDays}
          onChange={(e) => setExpiryDays(e.target.value)}
          aria-label={t('Override expiry in days')}
          disabled={mutation.isPending}
          className="h-8 w-14 rounded-md border border-border bg-background px-2 text-xs tabular-nums outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        />
        <span className="text-xs text-muted-foreground">{t('days')}</span>
        <Button type="submit" variant="brand" size="sm" disabled={mutation.isPending} className="h-8 px-2.5 text-[11px]">
          {mutation.isPending ? t('Saving…') : t('Confirm')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={mutation.isPending}
          onClick={() => {
            setOverriding(false);
            setFormErr(null);
          }}
          className="h-8 px-2 text-[11px]"
        >
          {t('Cancel')}
        </Button>
        {formErr && <span className="w-full text-right text-[10px] text-destructive">{formErr}</span>}
        {mutation.isError && (
          <span className="w-full text-right text-[10px] text-destructive">
            {mutation.error instanceof Error ? mutation.error.message : t('Failed')}
          </span>
        )}
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <Button
        variant="outline"
        size="sm"
        className="h-8 px-2.5 text-[11px]"
        disabled={flag.tier === null || mutation.isPending}
        title={flag.tier === null ? t('This flag affects every tier — override needs a single tier') : undefined}
        onClick={() => setOverriding(true)}
      >
        {t('Override')}
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-8 px-2.5 text-[11px]"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate({ action: 'acknowledge' })}
      >
        {t('Acknowledge')}
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-8 px-2.5 text-[11px]"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate({ action: 'watch' })}
      >
        {t('Watch')}
      </Button>
      <Button
        variant="subtle"
        size="sm"
        className="h-8 px-2.5 text-[11px]"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate({ action: 'resolve' })}
      >
        {t('Resolve')}
      </Button>
      {mutation.isError && (
        <span className="w-full text-right text-[10px] text-destructive">
          {mutation.error instanceof Error ? mutation.error.message : t('Failed')}
        </span>
      )}
    </div>
  );
}

export default function PricingFlagsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['admin-pricing-flags'], queryFn: fetchOpenFlags });
  const rows = query.data ?? [];

  function refetch() {
    queryClient.invalidateQueries({ queryKey: ['admin-pricing-flags'] });
  }

  return (
    <div className="space-y-6">
      <AdminHeading
        title="Flag queue"
        subtitle={
          query.isSuccess
            ? `${rows.length} ${t('open pricing flags')} — ${t('override, acknowledge, watch, or resolve each one')}`
            : t('Pricing engine flags waiting on an admin decision')
        }
      />

      <div className="rounded-2xl border border-brand/20 bg-brand/5 px-4 py-3 text-sm text-muted-foreground">
        <b className="text-foreground">{t('What is this?')}</b> {t('Before a price goes live the system flags anything that looks off — a cost that jumped a lot, a tier that would sell below your profit floor, or a SKU with no benchmark yet. A flagged price is')} <b className="text-foreground">{t('held back from customers')}</b> {t('until you decide:')} <b className="text-foreground">{t('Override')}</b> {t('(publish it anyway),')} <b className="text-foreground">{t('Acknowledge')}</b> {t('(it’s fine),')} {t('or')} <b className="text-foreground">{t('Watch')}</b> {t('(keep an eye on it). This is the safety net that stops a bad price from ever reaching a buyer.')}
      </div>

      {query.isError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {t('Could not load flags')}: {query.error instanceof Error ? query.error.message : t('unknown error')}
        </div>
      )}

      {query.isLoading && (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">{t('Loading flags…')}</div>
      )}

      {query.isSuccess && rows.length === 0 && (
        <Panel>
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <ShieldCheck className="h-10 w-10 text-success" strokeWidth={1.5} />
            <div>
              <p className="font-medium">{t('No open flags')}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t('Every priced variant clears its margin floor and tier order. New flags appear here the moment the engine finds one.')}</p>
            </div>
          </div>
        </Panel>
      )}

      {query.isSuccess && rows.length > 0 && (
        <Table
          minWidth={980}
          columns={[
            { key: 'kind', label: t('Kind') },
            { key: 'variant', label: t('Variant') },
            { key: 'tier', label: t('Tier') },
            { key: 'details', label: t('Details') },
            { key: 'age', label: t('Age') },
            { key: 'actions', label: t('Actions'), align: 'right' },
          ]}
        >
          {rows.map((r) => (
            <tr key={r.id} className="transition-colors hover:bg-muted/40">
              <Td>
                <span className={cn('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', 'bg-warning/10 text-warning')}>
                  {t(KIND_LABEL[r.kind])}
                </span>
              </Td>
              <Td className="font-medium">
                {r.make} {r.model}
                <span className="block font-mono text-xs font-normal text-muted-foreground">{r.sku}</span>
              </Td>
              <Td className="text-muted-foreground">{r.tier ? t(TIER_LABEL[r.tier]) : t('All tiers')}</Td>
              <Td className="max-w-xs text-xs text-muted-foreground">{summarizePayload(r.payload)}</Td>
              <Td className="text-xs text-muted-foreground">{t(formatAge(r.createdAt))}</Td>
              <Td align="right">
                <FlagActions flag={r} onResolved={refetch} />
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
