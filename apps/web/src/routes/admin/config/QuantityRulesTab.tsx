import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getAppSetting, setAppSetting } from '@/data/adminConfig';
import { DB_TIERS, DB_TIER_LABELS, type DbTier } from '@/lib/invites';
import { Panel } from '@/components/admin/parts';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n';
import { Field, MutationError, TextInput } from './parts';
import { cn } from '@/lib/utils';

type Mode = 'off' | 'warn' | 'block';
interface TierRule {
  min: number;
  multiple: number;
}
interface QtyRules {
  mode: Mode;
  tiers?: Partial<Record<DbTier, TierRule>>;
}

const DEFAULT: QtyRules = { mode: 'off' };

const MODE_META: Record<Mode, { label: string; help: string; tone: string }> = {
  off: { label: 'Off', help: 'No quantity rules enforced (default).', tone: 'bg-muted text-muted-foreground' },
  warn: { label: 'Warn', help: 'Show a warning but still allow the order.', tone: 'bg-warning/15 text-warning' },
  block: { label: 'Block', help: 'Prevent adding to cart / placing when a rule is violated.', tone: 'bg-destructive/15 text-destructive' },
};

function ruleFor(rules: QtyRules, tier: DbTier): TierRule {
  return rules.tiers?.[tier] ?? { min: 1, multiple: 1 };
}

export default function QuantityRulesTab() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['app_setting', 'cart_quantity_rules'], queryFn: () => getAppSetting<QtyRules>('cart_quantity_rules', DEFAULT) });
  const [draft, setDraft] = useState<QtyRules>(DEFAULT);

  useEffect(() => {
    if (q.data) setDraft(q.data);
  }, [q.data]);

  const save = useMutation({
    mutationFn: (value: QtyRules) => setAppSetting('cart_quantity_rules', value),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['app_setting', 'cart_quantity_rules'] }),
  });

  const dirty = JSON.stringify(draft) !== JSON.stringify(q.data ?? DEFAULT);

  function setTierRule(tier: DbTier, patch: Partial<TierRule>) {
    const current = ruleFor(draft, tier);
    setDraft({ ...draft, tiers: { ...draft.tiers, [tier]: { ...current, ...patch } } });
  }

  return (
    <div className="space-y-6">
      <Panel title={t('Enforcement mode')}>
        <p className="mb-4 text-sm text-muted-foreground">
          {t('Minimum order quantity and pack multiples, per tier. Enforcement is opt-in — it ships')}{' '}<span className="font-medium text-foreground">{t('off')}</span>{' '}
          {t('and the cart never gates until an admin turns it on here.')}
        </p>
        <div className="flex flex-wrap gap-2">
          {(['off', 'warn', 'block'] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setDraft({ ...draft, mode: m })}
              className={cn(
                'rounded-xl border px-4 py-2 text-sm transition-colors',
                draft.mode === m ? 'border-brand bg-brand/5 font-medium' : 'border-border hover:bg-muted',
              )}
            >
              <span className={cn('mr-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', MODE_META[m].tone)}>{t(MODE_META[m].label)}</span>
              <span className="text-muted-foreground">{t(MODE_META[m].help)}</span>
            </button>
          ))}
        </div>
      </Panel>

      <Panel title={t('Per-tier rules')}>
        <div className="grid gap-4 sm:grid-cols-2">
          {DB_TIERS.map((tier) => {
            const rule = ruleFor(draft, tier);
            return (
              <div key={tier} className="rounded-2xl border border-border p-4">
                <p className="mb-3 text-sm font-medium">{DB_TIER_LABELS[tier]}</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('Min units')}>
                    <TextInput
                      type="number"
                      min="1"
                      value={rule.min}
                      disabled={draft.mode === 'off'}
                      onChange={(e) => setTierRule(tier, { min: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
                    />
                  </Field>
                  <Field label={t('Multiple of')}>
                    <TextInput
                      type="number"
                      min="1"
                      value={rule.multiple}
                      disabled={draft.mode === 'off'}
                      onChange={(e) => setTierRule(tier, { multiple: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
                    />
                  </Field>
                </div>
              </div>
            );
          })}
        </div>
        {draft.mode === 'off' && <p className="mt-3 text-xs text-muted-foreground">{t('Set mode to Warn or Block to edit per-tier rules.')}</p>}
      </Panel>

      <div className="flex items-center gap-3">
        <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate(draft)}>
          {save.isPending ? t('Saving…') : t('Save quantity rules')}
        </Button>
        {save.isSuccess && !dirty && <span className="text-xs text-success">{t('Saved ✓')}</span>}
        <MutationError error={save.error} />
      </div>
    </div>
  );
}
