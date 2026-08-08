import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { getAppSetting, setAppSetting } from '@/data/adminConfig';
import { useI18n } from '@/i18n';
import { Panel } from '@/components/admin/parts';
import { Button } from '@/components/ui/Button';
import { MutationError, Toggle } from './parts';

interface Gate {
  checkout: boolean;
  approval: boolean;
}
type Enforcement = Record<string, Gate>;

const DEFAULT: Enforcement = {
  g1_business_name: { checkout: false, approval: false },
  g2_tax_certificate: { checkout: false, approval: true },
  shipping_address: { checkout: true, approval: false },
};

const FIELD_LABELS: Record<string, { label: string; help: string }> = {
  g1_business_name: { label: 'Business name (G1)', help: 'Legal business name captured at registration.' },
  g2_tax_certificate: { label: 'Tax certificate (G2)', help: 'Resale/exemption certificate for business tiers.' },
  shipping_address: { label: 'Shipping address', help: 'A default shipping address on file.' },
};

export default function EnforcementTab() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['app_setting', 'enforcement_points'], queryFn: () => getAppSetting<Enforcement>('enforcement_points', DEFAULT) });
  const [draft, setDraft] = useState<Enforcement>(DEFAULT);

  useEffect(() => {
    if (q.data) setDraft(q.data);
  }, [q.data]);

  const save = useMutation({
    mutationFn: (value: Enforcement) => setAppSetting('enforcement_points', value),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['app_setting', 'enforcement_points'] }),
  });

  const dirty = JSON.stringify(draft) !== JSON.stringify(q.data ?? DEFAULT);
  const fields = Object.keys({ ...DEFAULT, ...(q.data ?? {}) });

  function toggle(field: string, gate: keyof Gate, next: boolean) {
    const current = draft[field] ?? { checkout: false, approval: false };
    setDraft({ ...draft, [field]: { ...current, [gate]: next } });
  }

  return (
    <div className="space-y-6">
      <Panel title={t('G1 / G2 enforcement points')}>
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t('Config only — this records WHERE each field is required (at checkout and/or at order approval). Wiring the gate into those flows is a separate change; this is the single source of truth it will read.')}
        </div>

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm" style={{ minWidth: 480 }}>
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">{t('Field')}</th>
                <th className="px-4 py-2.5 font-medium text-center">{t('At checkout')}</th>
                <th className="px-4 py-2.5 font-medium text-center">{t('At approval')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {fields.map((f) => {
                const gate = draft[f] ?? { checkout: false, approval: false };
                const meta = FIELD_LABELS[f] ?? { label: f, help: '' };
                return (
                  <tr key={f}>
                    <td className="px-4 py-3">
                      <span className="font-medium">{t(meta.label)}</span>
                      {meta.help && <span className="block text-xs text-muted-foreground">{t(meta.help)}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center">
                        <Toggle label={`${t(meta.label)} ${t('at checkout')}`} checked={gate.checkout} onChange={(n) => toggle(f, 'checkout', n)} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center">
                        <Toggle label={`${t(meta.label)} ${t('at approval')}`} checked={gate.approval} onChange={(n) => toggle(f, 'approval', n)} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="flex items-center gap-3">
        <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate(draft)}>
          {save.isPending ? t('Saving…') : t('Save enforcement points')}
        </Button>
        {save.isSuccess && !dirty && <span className="text-xs text-success">{t('Saved ✓')}</span>}
        <MutationError error={save.error} />
      </div>
    </div>
  );
}
