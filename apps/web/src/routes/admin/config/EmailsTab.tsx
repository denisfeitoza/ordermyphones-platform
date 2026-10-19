import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Panel } from '@/components/admin/parts';
import { renderEmail } from '@/lib/emailTemplates';
import { formatDateTime } from '@/lib/format';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

interface OutboxRow {
  id: string;
  template: string;
  to_email: string | null;
  to_staff: boolean;
  locale: string;
  payload: Record<string, unknown>;
  status: 'queued' | 'sent' | 'failed' | 'skipped';
  attempts: number;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
}

const STATUS_CLS: Record<OutboxRow['status'], string> = {
  queued: 'bg-muted text-muted-foreground',
  sent: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  failed: 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300',
  skipped: 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300',
};

/**
 * Admin → Settings → E-mails: every transactional e-mail the system queued
 * (order placed/approved/shipped, payment, label, invite, registration).
 * Nothing is sent until the SMTP provider is connected; then this list shows
 * what went out and what failed.
 */
export default function EmailsTab() {
  const { t, lang } = useI18n();
  const [openId, setOpenId] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['email-outbox'],
    refetchInterval: 30_000,
    queryFn: async (): Promise<OutboxRow[]> => {
      const { data, error } = await supabase.from('email_outbox').select('*').order('created_at', { ascending: false }).limit(300);
      if (error) throw new Error(error.message);
      return (data ?? []) as OutboxRow[];
    },
  });
  const rows = q.data ?? [];
  const queued = rows.filter((r) => r.status === 'queued').length;

  return (
    <div className="space-y-4">
      <p className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
        {t('E-mail sending is not connected yet: messages wait here and go out once the SMTP provider is set up.')} {queued > 0 && `${queued} ${t('waiting')}.`}
      </p>
      <Panel title={`${t('Outbox')} · ${rows.length}`}>
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">{t('Loading…')}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('Nothing queued yet.')}</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {rows.map((r) => {
              const preview = openId === r.id ? renderEmail(r.template, r.locale, r.payload, window.location.origin) : null;
              return (
                <li key={r.id} className="px-3 py-2.5 text-sm">
                  <button type="button" onClick={() => setOpenId(openId === r.id ? null : r.id)} className="flex min-h-11 w-full flex-wrap items-center gap-2 text-left">
                    <span className={cn('rounded-full px-2 py-0.5 text-[0.65rem] font-semibold', STATUS_CLS[r.status])}>{t(r.status)}</span>
                    <span className="font-mono text-xs">{r.template}</span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">{r.to_staff ? t('Staff') : r.to_email}</span>
                    <span className="font-mono text-xs text-muted-foreground">{formatDateTime(r.created_at, lang)}</span>
                  </button>
                  {preview && (
                    <div className="mt-2 rounded-lg bg-muted/40 p-3">
                      <p className="font-medium">{preview.subject}</p>
                      <pre className="mt-1 whitespace-pre-wrap font-sans text-xs text-muted-foreground">{preview.text}</pre>
                      {r.last_error && <p className="mt-2 text-xs text-destructive">{r.last_error}</p>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
