import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, FileText, PenLine, Upload } from 'lucide-react';
import { useAuth } from '@/store';
import { PageHeading } from '@/components/portal/parts';
import { Button } from '@/components/ui/Button';
import {
  DOCUMENT_SLOTS,
  EMPTY_PROFILE,
  documentUrl,
  uploadAccountDocument,
  useAccountDocuments,
  useAgreementSignatures,
  useAgreementVersions,
  useBusinessProfile,
  useSaveBusinessProfile,
  useSignAgreement,
  type Address,
  type BusinessProfile,
  type Contact,
  type DocumentKind,
} from '@/data/onboarding';
import { useQueryClient } from '@tanstack/react-query';
import { formatDate } from '@/lib/format';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

const inputCls = 'h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand disabled:opacity-60';
const labelCls = 'mb-1.5 block text-xs font-medium text-muted-foreground';

const STATUS_STYLE: Record<BusinessProfile['status'], { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'bg-muted text-muted-foreground' },
  submitted: { label: 'In review', cls: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300' },
  approved: { label: 'Approved', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300' },
  changes_requested: { label: 'Changes requested', cls: 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300' },
};

/**
 * Portal → Business profile: the CX Reg registration (company, contacts,
 * certificates), the document slots, and the Master Agreement signature.
 * Only the account owner edits; team members read.
 */
export default function BusinessPage() {
  const { t } = useI18n();
  const { profile } = useAuth();
  const accountId = profile ? (profile.parent_account_id ?? profile.id) : null;
  const isOwner = !!profile && !profile.parent_account_id;

  if (!accountId) return <p className="py-10 text-center text-sm text-muted-foreground">{t('Loading…')}</p>;
  return (
    <div className="space-y-6">
      <PageHeading title="Business profile" subtitle="Your company registration, documents and the agreement we sign together." />
      {!isOwner && <p className="rounded-xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground">{t('Only the account owner can change these details.')}</p>}
      <AgreementSection accountId={accountId} isOwner={isOwner} />
      <ProfileSection accountId={accountId} isOwner={isOwner} />
      <DocumentsSection accountId={accountId} isOwner={isOwner} />
    </div>
  );
}

function Text({ label, value, onChange, disabled, ...rest }: { label: string; value: string | null | undefined; onChange: (v: string) => void; disabled: boolean } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const { t } = useI18n();
  return (
    <label>
      <span className={labelCls}>{t(label)}</span>
      <input {...rest} value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={inputCls} />
    </label>
  );
}

function ProfileSection({ accountId, isOwner }: { accountId: string; isOwner: boolean }) {
  const { t, lang } = useI18n();
  const q = useBusinessProfile(accountId);
  const save = useSaveBusinessProfile();
  const [p, setP] = useState<BusinessProfile | null>(null);
  useEffect(() => {
    if (q.isSuccess && !p) setP(q.data ?? EMPTY_PROFILE(accountId));
  }, [q.isSuccess, q.data, p, accountId]);
  if (!p) return null;

  const ro = !isOwner;
  const set = <K extends keyof BusinessProfile>(k: K, v: BusinessProfile[K]) => setP({ ...p, [k]: v });
  const setAddr = (k: 'business_address' | 'billing_address', f: keyof Address, v: string) => set(k, { ...(p[k] ?? {}), [f]: v });
  const setContact = (k: 'primary_contact' | 'ap_contact' | 'director', f: keyof Contact, v: string) => set(k, { ...(p[k] ?? {}), [f]: v });
  const style = STATUS_STYLE[q.data?.status ?? 'draft'];
  const missing = !p.legal_name?.trim() || !p.ein?.trim() || !p.business_address?.street?.trim() || !p.director?.name?.trim();

  const address = (k: 'business_address' | 'billing_address', title: string) => (
    <fieldset className="grid gap-3 sm:grid-cols-4">
      <legend className="mb-2 text-sm font-medium sm:col-span-4">{t(title)}</legend>
      <div className="sm:col-span-4">
        <Text label="Street" value={p[k]?.street} onChange={(v) => setAddr(k, 'street', v)} disabled={ro} maxLength={200} />
      </div>
      <div className="sm:col-span-2">
        <Text label="City" value={p[k]?.city} onChange={(v) => setAddr(k, 'city', v)} disabled={ro} maxLength={100} />
      </div>
      <Text label="State" value={p[k]?.state} onChange={(v) => setAddr(k, 'state', v)} disabled={ro} maxLength={60} />
      <Text label="ZIP" value={p[k]?.zip} onChange={(v) => setAddr(k, 'zip', v)} disabled={ro} maxLength={20} />
    </fieldset>
  );
  const contact = (k: 'primary_contact' | 'ap_contact' | 'director', title: string) => (
    <fieldset className="grid gap-3 sm:grid-cols-4">
      <legend className="mb-2 text-sm font-medium sm:col-span-4">{t(title)}</legend>
      <Text label="Name" value={p[k]?.name} onChange={(v) => setContact(k, 'name', v)} disabled={ro} maxLength={120} />
      <Text label="Title" value={p[k]?.title} onChange={(v) => setContact(k, 'title', v)} disabled={ro} maxLength={120} />
      <Text label="E-mail" type="email" value={p[k]?.email} onChange={(v) => setContact(k, 'email', v)} disabled={ro} maxLength={200} />
      <Text label="Phone" type="tel" value={p[k]?.phone} onChange={(v) => setContact(k, 'phone', v)} disabled={ro} maxLength={40} />
    </fieldset>
  );

  return (
    <section className="space-y-6 rounded-2xl border border-border p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">{t('Company registration')}</h2>
        <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', style.cls)}>{t(style.label)}</span>
      </div>
      {q.data?.status === 'changes_requested' && q.data.review_note && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          {t('Our team asked for changes')}: {q.data.review_note}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Text label="Legal name" value={p.legal_name} onChange={(v) => set('legal_name', v)} disabled={ro} maxLength={200} />
        <Text label="DBA (trade name)" value={p.dba} onChange={(v) => set('dba', v)} disabled={ro} maxLength={200} />
        <Text label="Entity type" value={p.entity_type} onChange={(v) => set('entity_type', v)} disabled={ro} placeholder="LLC" maxLength={60} />
        <Text label="EIN" value={p.ein} onChange={(v) => set('ein', v)} disabled={ro} placeholder="12-3456789" maxLength={20} />
        <Text label="State of incorporation" value={p.state_of_incorporation} onChange={(v) => set('state_of_incorporation', v)} disabled={ro} maxLength={60} />
        <Text
          label="Year established"
          inputMode="numeric"
          value={p.year_established ? String(p.year_established) : ''}
          onChange={(v) => set('year_established', v.replace(/\D/g, '') ? Number(v.replace(/\D/g, '').slice(0, 4)) : null)}
          disabled={ro}
        />
        <Text label="Website" value={p.website} onChange={(v) => set('website', v)} disabled={ro} maxLength={200} />
        <Text label="Phone" type="tel" value={p.phone} onChange={(v) => set('phone', v)} disabled={ro} maxLength={40} />
        <Text label="Monthly volume (units)" value={p.monthly_volume} onChange={(v) => set('monthly_volume', v)} disabled={ro} placeholder="500" maxLength={60} />
      </div>

      {address('business_address', 'Business address')}
      {address('billing_address', 'Billing address (if different)')}
      {contact('director', 'Director (signs the agreement)')}
      {contact('primary_contact', 'Purchasing contact')}
      {contact('ap_contact', 'Accounts payable')}

      <fieldset className="grid gap-3 sm:grid-cols-4">
        <legend className="mb-2 text-sm font-medium sm:col-span-4">{t('Certificates and shipping')}</legend>
        <Text label="Resale certificate number" value={p.resale_cert_number} onChange={(v) => set('resale_cert_number', v)} disabled={ro} maxLength={60} />
        <Text label="Resale certificate state" value={p.resale_cert_state} onChange={(v) => set('resale_cert_state', v)} disabled={ro} placeholder="TX" maxLength={60} />
        <Text label="R2 certificate number" value={p.r2_cert_number} onChange={(v) => set('r2_cert_number', v)} disabled={ro} maxLength={60} />
        <Text label="D-U-N-S number" value={p.duns_number} onChange={(v) => set('duns_number', v)} disabled={ro} maxLength={20} />
        <Text label="Carrier for your shipping account" value={p.carrier_account?.carrier} onChange={(v) => set('carrier_account', { ...(p.carrier_account ?? {}), carrier: v })} disabled={ro} placeholder="FedEx" maxLength={40} />
        <Text label="Carrier account number" value={p.carrier_account?.account_number} onChange={(v) => set('carrier_account', { ...(p.carrier_account ?? {}), account_number: v })} disabled={ro} maxLength={60} />
      </fieldset>

      {save.isError && <p className="text-sm text-destructive">{save.error.message}</p>}
      {isOwner && (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          <Button variant="outline" disabled={save.isPending} onClick={() => save.mutate({ profile: p, submit: false })}>
            {t('Save draft')}
          </Button>
          <Button variant="brand" disabled={save.isPending || missing} onClick={() => save.mutate({ profile: p, submit: true })}>
            {t('Submit for review')}
          </Button>
          {missing && <span className="text-xs text-muted-foreground">{t('Legal name, EIN, business address and director are needed to submit.')}</span>}
          {q.data?.submitted_at && !missing && (
            <span className="text-xs text-muted-foreground">
              {t('Last submitted')} {formatDate(q.data.submitted_at, lang)}
            </span>
          )}
        </div>
      )}
    </section>
  );
}

function DocumentsSection({ accountId, isOwner }: { accountId: string; isOwner: boolean }) {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const docs = useAccountDocuments(accountId);
  const [busy, setBusy] = useState<DocumentKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputs = useRef<Partial<Record<DocumentKind, HTMLInputElement | null>>>({});

  async function upload(kind: DocumentKind, file: File) {
    setError(null);
    setBusy(kind);
    try {
      await uploadAccountDocument(accountId, kind, file);
      void qc.invalidateQueries({ queryKey: ['account-documents', accountId] });
      void qc.invalidateQueries({ queryKey: ['my-order-requirements'] });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Upload failed.'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border p-5">
      <h2 className="font-medium">{t('Documents')}</h2>
      <p className="text-sm text-muted-foreground">{t('PDF, PNG or JPG, up to 10 MB. Our team reviews each one.')}</p>
      <ul className="divide-y divide-border rounded-xl border border-border">
        {DOCUMENT_SLOTS.map((slot) => {
          const latest = docs.data?.find((d) => d.kind === slot.kind);
          return (
            <li key={slot.kind} className="flex flex-wrap items-center gap-3 px-3 py-3">
              <FileText className="h-5 w-5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
              <div className="min-w-0 flex-1 basis-48">
                <p className="text-sm font-medium">{t(slot.label)}</p>
                <p className="text-xs text-muted-foreground">
                  {latest ? (
                    <>
                      <button type="button" className="underline-offset-2 hover:underline" onClick={() => void documentUrl(latest.file_path).then((u) => window.open(u, '_blank', 'noopener'))}>
                        {latest.file_name ?? t('File')}
                      </button>{' '}
                      · {formatDate(latest.uploaded_at, lang)} ·{' '}
                      <span className={latest.status === 'approved' ? 'text-success' : latest.status === 'rejected' ? 'text-destructive' : ''}>
                        {t(latest.status === 'approved' ? 'Approved' : latest.status === 'rejected' ? 'Rejected' : 'In review')}
                      </span>
                      {latest.review_note ? ` · ${latest.review_note}` : ''}
                    </>
                  ) : (
                    t(slot.help)
                  )}
                </p>
              </div>
              {isOwner && (
                <>
                  <input
                    ref={(el) => {
                      inputs.current[slot.kind] = el;
                    }}
                    type="file"
                    accept="application/pdf,image/png,image/jpeg"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (f) void upload(slot.kind, f);
                    }}
                  />
                  <Button size="sm" variant="outline" className="min-h-11 sm:min-h-0" disabled={busy !== null} onClick={() => inputs.current[slot.kind]?.click()}>
                    <Upload className="h-4 w-4" strokeWidth={2} />
                    {busy === slot.kind ? t('Uploading…') : latest ? t('Replace') : t('Upload')}
                  </Button>
                </>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </section>
  );
}

function AgreementSection({ accountId, isOwner }: { accountId: string; isOwner: boolean }) {
  const { t, lang } = useI18n();
  const versions = useAgreementVersions();
  const sigs = useAgreementSignatures(accountId);
  const sign = useSignAgreement(accountId);
  const active = versions.data?.find((v) => v.is_active);
  const signedActive = active ? sigs.data?.find((s) => s.version_id === active.id) : undefined;
  const lastSig = sigs.data?.[0];
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [agree, setAgree] = useState(false);

  if (!active) return null;
  return (
    <section className="space-y-3 rounded-2xl border border-border p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-medium">
          <PenLine className="h-4 w-4 text-muted-foreground" strokeWidth={2} />
          {active.title}
        </h2>
        <span className="font-mono text-xs text-muted-foreground">v{active.version}</span>
      </div>
      {signedActive ? (
        <p className="flex items-start gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
          {t('Signed by')} {signedActive.signer_name} ({signedActive.signer_title}) · {formatDate(signedActive.signed_at, lang)}
        </p>
      ) : (
        <>
          {lastSig && <p className="text-sm text-muted-foreground">{t('A new version of the agreement is out. Please read and sign it.')}</p>}
          <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl border border-border bg-muted/30 p-4 text-sm leading-relaxed">{active.body}</div>
          {isOwner ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <span className={labelCls}>{t('Full name (typed signature)')}</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={cn(inputCls, 'font-medium')} />
                </label>
                <label>
                  <span className={labelCls}>{t('Title')}</span>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder={t('Director')} className={inputCls} />
                </label>
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                {t('I have read this agreement and sign it on behalf of the company.')}
              </label>
              {sign.isError && <p className="text-sm text-destructive">{sign.error.message}</p>}
              <Button variant="brand" disabled={!agree || name.trim().length < 2 || title.trim().length < 2 || sign.isPending} onClick={() => sign.mutate({ versionId: active.id, name: name.trim(), title: title.trim() })}>
                <PenLine className="h-4 w-4" strokeWidth={2} />
                {sign.isPending ? t('Signing…') : t('Sign agreement')}
              </Button>
              <p className="text-xs text-muted-foreground">{t('We record your name, title, the agreement version and its fingerprint, your IP address and the time.')}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('The account owner signs the agreement.')}</p>
          )}
        </>
      )}
    </section>
  );
}
