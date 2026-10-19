import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Panel } from '@/components/admin/parts';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/store';
import { useAgreementVersions } from '@/data/onboarding';
import { adminErrorMessage } from '@/lib/adminErrors';
import { formatDate } from '@/lib/format';
import { useI18n } from '@/i18n';

/**
 * Admin → Settings → Master Agreement: write a version, publish it (it
 * becomes the one buyers sign; published text can't change), and see who
 * signed which version.
 */
export default function AgreementTab() {
  const { t, lang } = useI18n();
  const { role, user } = useAuth();
  const isAdmin = role === 'admin';
  const qc = useQueryClient();
  const versions = useAgreementVersions();
  const [version, setVersion] = useState('');
  const [title, setTitle] = useState('Master Product Purchase and Sale Agreement');
  const [body, setBody] = useState('');

  const signatures = useQuery({
    queryKey: ['agreement-signatures-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agreement_signatures')
        .select('id, version_id, signer_name, signer_title, signed_at, ip, account:profiles!agreement_signatures_account_id_fkey(email, display_name)')
        .order('signed_at', { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as { id: string; version_id: string; signer_name: string; signer_title: string; signed_at: string; ip: string | null; account: { email: string; display_name: string | null } | null }[];
    },
  });

  const create = useMutation({
    mutationFn: async (publish: boolean) => {
      const { data, error } = await supabase.from('agreement_versions').insert({ version: version.trim(), title: title.trim(), body, created_by: user?.id ?? null }).select('id').single();
      if (error) throw new Error(error.message);
      if (publish) {
        const { error: e2 } = await supabase.rpc('activate_agreement_version', { p_version_id: (data as { id: string }).id });
        if (e2) throw new Error(e2.message);
      }
    },
    onSuccess: () => {
      setVersion('');
      setBody('');
      void qc.invalidateQueries({ queryKey: ['agreement-versions'] });
    },
  });
  const activate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('activate_agreement_version', { p_version_id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['agreement-versions'] }),
  });
  const versionName = (id: string) => versions.data?.find((v) => v.id === id)?.version ?? '—';

  return (
    <div className="space-y-4">
      {!versions.data?.some((v) => v.is_active) && (
        <p className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
          {t('No agreement is published yet: buyers have nothing to sign and approvals do not ask for it.')}
        </p>
      )}

      <Panel title={t('Versions')}>
        {versions.data?.length ? (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {versions.data.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    v{v.version} · {v.title}
                  </p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    sha256 {v.sha256.slice(0, 16)}… · {v.published_at ? `${t('published')} ${formatDate(v.published_at, lang)}` : t('draft')}
                  </p>
                </div>
                {v.is_active ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
                    <CheckCircle2 className="h-4 w-4" strokeWidth={2} />
                    {t('Active')}
                  </span>
                ) : (
                  isAdmin && (
                    <Button size="sm" variant="outline" disabled={activate.isPending} onClick={() => activate.mutate(v.id)}>
                      {t('Make active')}
                    </Button>
                  )
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t('No versions yet.')}</p>
        )}
        {activate.isError && <p className="mt-2 text-sm text-destructive">{adminErrorMessage(t, activate.error.message)}</p>}
      </Panel>

      {isAdmin && (
        <Panel title={t('New version')}>
          <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
            <label>
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{t('Version')}</span>
              <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="2026-10" maxLength={40} className="h-11 w-full rounded-xl border border-border bg-background px-3 font-mono text-sm outline-none focus:border-brand" />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{t('Document title')}</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand" />
            </label>
          </div>
          <label className="mt-3 block">
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{t('Full text (paste the agreement)')}</span>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} maxLength={200000} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 font-mono text-xs leading-relaxed outline-none focus:border-brand" />
          </label>
          <p className="mt-2 text-xs text-muted-foreground">{t('Once published, the text cannot change — publish a new version instead. Existing signatures keep pointing at the version they signed.')}</p>
          {create.isError && <p className="mt-2 text-sm text-destructive">{create.error.message}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" disabled={create.isPending || !version.trim() || !body.trim()} onClick={() => create.mutate(false)}>
              {t('Save as draft')}
            </Button>
            <Button variant="brand" disabled={create.isPending || !version.trim() || !body.trim()} onClick={() => create.mutate(true)}>
              {t('Publish and make active')}
            </Button>
          </div>
        </Panel>
      )}

      <Panel title={`${t('Signatures')} · ${signatures.data?.length ?? 0}`}>
        {signatures.data?.length ? (
          <ul className="divide-y divide-border rounded-xl border border-border text-sm">
            {signatures.data.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                <span className="min-w-0">
                  <span className="block font-medium">{s.account?.display_name ?? s.account?.email ?? '—'}</span>
                  <span className="block text-xs text-muted-foreground">
                    {s.signer_name} · {s.signer_title} · v{versionName(s.version_id)}
                  </span>
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {formatDate(s.signed_at, lang)}
                  {s.ip ? ` · ${s.ip}` : ''}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t('Nobody has signed yet.')}</p>
        )}
      </Panel>
    </div>
  );
}
