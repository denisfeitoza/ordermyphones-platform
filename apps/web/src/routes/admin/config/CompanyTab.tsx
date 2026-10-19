import { useEffect, useState } from 'react';
import { Panel } from '@/components/admin/parts';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/store';
import { COMPANY_FIELDS, useCompanyProfile, useSaveCompanyProfile, type CompanyProfile } from '@/data/companyProfile';
import { useI18n } from '@/i18n';

const GROUPS: { title: string; fields: { key: keyof CompanyProfile; label: string; long?: boolean }[] }[] = [
  {
    title: 'Company',
    fields: [
      { key: 'legal_name', label: 'Legal name' },
      { key: 'address', label: 'Address', long: true },
      { key: 'phone', label: 'Phone' },
      { key: 'email', label: 'E-mail' },
      { key: 'website', label: 'Website' },
    ],
  },
  {
    title: 'Bank details for ACH / wire',
    fields: [
      { key: 'bank_name', label: 'Bank' },
      { key: 'bank_account_name', label: 'Account name' },
      { key: 'routing_number', label: 'Routing (ABA)' },
      { key: 'account_number', label: 'Account number' },
      { key: 'swift', label: 'SWIFT (international)' },
      { key: 'bank_address', label: 'Bank address', long: true },
      { key: 'payment_notes', label: 'Payment notes', long: true },
    ],
  },
  {
    title: 'Master Agreement terms on the Sales Order',
    fields: [
      { key: 'transfer_date_rule', label: 'Transfer Date', long: true },
      { key: 'discrepancy_threshold', label: 'Discrepancy Threshold', long: true },
      { key: 'sales_order_footer', label: 'Footer', long: true },
    ],
  },
];

const inputCls = 'w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand disabled:opacity-60';

/**
 * Admin → Settings → Company & Sales Order: what every Sales Order prints.
 * Buyers see the bank details on their Sales Order; only admins edit them.
 */
export default function CompanyTab() {
  const { t } = useI18n();
  const { role } = useAuth();
  const canEdit = role === 'admin';
  const q = useCompanyProfile();
  const save = useSaveCompanyProfile();
  const [form, setForm] = useState<CompanyProfile | null>(null);
  useEffect(() => {
    if (q.data && !form) setForm(q.data);
  }, [q.data, form]);

  if (!form) return <p className="py-8 text-center text-sm text-muted-foreground">{t('Loading…')}</p>;
  const missingBank = !form.bank_name || !form.routing_number || !form.account_number;

  return (
    <div className="space-y-4">
      {missingBank && (
        <p className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
          {t('Bank details are missing: Sales Orders go out without payment instructions until you fill them in.')}
        </p>
      )}
      {GROUPS.map((g) => (
        <Panel key={g.title} title={t(g.title)}>
          <div className="grid gap-3 sm:grid-cols-2">
            {g.fields.map((f) => (
              <label key={f.key} className={f.long ? 'sm:col-span-2' : undefined}>
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{t(f.label)}</span>
                {f.long ? (
                  <textarea rows={2} value={form[f.key] ?? ''} disabled={!canEdit} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} className={`${inputCls} py-2.5`} maxLength={1000} />
                ) : (
                  <input value={form[f.key] ?? ''} disabled={!canEdit} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} className={`${inputCls} h-11`} maxLength={200} />
                )}
              </label>
            ))}
          </div>
        </Panel>
      ))}
      {save.isError && <p className="text-sm text-destructive">{save.error.message}</p>}
      <div className="flex items-center gap-3">
        <Button variant="brand" disabled={!canEdit || save.isPending} onClick={() => save.mutate(Object.fromEntries(COMPANY_FIELDS.map((k) => [k, form[k]])) as unknown as CompanyProfile)}>
          {save.isPending ? t('Saving…') : t('Save')}
        </Button>
        {!canEdit && <span className="text-sm text-muted-foreground">{t('Only an admin can change these.')}</span>}
        {save.isSuccess && <span className="text-sm text-success">{t('Saved')}</span>}
      </div>
    </div>
  );
}
