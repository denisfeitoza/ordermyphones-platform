import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, FileCheck2, FileUp, Loader2 } from 'lucide-react';
import { useAuth } from '@/store';
import { supabase } from '@/lib/supabase';
import { Panel } from '@/components/portal/parts';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n';
import { isBusinessTier, type DbTier } from '@/lib/invites';
import { profileCompleteness, type CompletenessField } from '@/lib/profileCompleteness';
import { cn } from '@/lib/utils';

const CERT_BUCKET = 'tax-certificates';

interface ContactProfile {
  tier: DbTier | null;
  display_name: string | null;
  phone: string | null;
  shipping_address: unknown | null;
}

/** Fetches the profile contact fields (G0/G1) not carried on the auth store. */
function useContactProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ['profile-contact', userId],
    enabled: !!userId,
    queryFn: async (): Promise<ContactProfile> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('tier,display_name,phone,shipping_address')
        .eq('id', userId!)
        .single();
      if (error) throw error;
      return data as ContactProfile;
    },
  });
}

/** Lists the user's own folder in the private tax-certificates bucket. */
function useCertStatus(userId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['tax-cert', userId],
    enabled: !!userId && enabled,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.storage.from(CERT_BUCKET).list(userId!);
      if (error) throw error;
      return (data ?? []).length > 0;
    },
  });
}

function Meter({ pct }: { pct: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn('h-full rounded-full transition-[width] duration-500', pct === 100 ? 'bg-success' : 'bg-brand')}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function ChecklistItem({ field }: { field: CompletenessField }) {
  const { t } = useI18n();
  return (
    <li className="flex items-center gap-2 text-sm">
      <span
        className={cn(
          'grid h-5 w-5 shrink-0 place-items-center rounded-full',
          field.done ? 'bg-success/15 text-success' : 'border border-border text-transparent',
        )}
      >
        <Check className="h-3 w-3" strokeWidth={3} />
      </span>
      <span className={field.done ? 'text-muted-foreground line-through' : ''}>{t(field.label)}</span>
    </li>
  );
}

export function ProfileCompletionPanel() {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const profileQuery = useContactProfile(user?.id);
  const profile = profileQuery.data;
  const business = !!profile?.tier && isBusinessTier(profile.tier);

  const certQuery = useCertStatus(user?.id, business);
  const hasTaxCertificate = certQuery.data ?? false;

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!user) throw new Error('no session');
      // Path convention: `${uid}/<filename>` — the first segment is the uid the
      // storage RLS checks. upsert so re-upload overwrites in place.
      const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf';
      const path = `${user.id}/certificate.${ext}`;
      const { error } = await supabase.storage.from(CERT_BUCKET).upload(path, file, { upsert: true });
      if (error) throw error;
    },
    onSuccess: () => {
      setUploadError(null);
      qc.invalidateQueries({ queryKey: ['tax-cert', user?.id] });
    },
    onError: (e) => setUploadError((e as Error).message),
  });

  if (!profile) {
    // Loading / no profile — render nothing rather than a broken meter.
    return null;
  }

  const completeness = profileCompleteness({
    tier: profile.tier,
    display_name: profile.display_name,
    phone: profile.phone,
    shippingAddress: profile.shipping_address,
    hasTaxCertificate,
  });

  return (
    <>
      <Panel title="Profile completeness">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {completeness.pct === 100
              ? t('Your profile is complete.')
              : t('Add the missing details to speed up approvals.')}
          </p>
          <span className="font-mono text-lg font-semibold tabular-nums">{completeness.pct}%</span>
        </div>
        <div className="mt-3">
          <Meter pct={completeness.pct} />
        </div>
        <ul className="mt-4 space-y-2">
          {completeness.fields.map((f) => (
            <ChecklistItem key={f.key} field={f} />
          ))}
        </ul>
      </Panel>

      {business && (
        <Panel title="Tax certificate">
          <p className="text-sm text-muted-foreground">
            {t('Upload your Sales Tax Certificate to speed up B2B order approval. Your order can still be placed without it.')}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
                hasTaxCertificate ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground',
              )}
            >
              {hasTaxCertificate ? <FileCheck2 className="h-3.5 w-3.5" /> : <FileUp className="h-3.5 w-3.5" />}
              {hasTaxCertificate ? t('Submitted') : t('Not submitted')}
            </span>

            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) upload.mutate(file);
                e.currentTarget.value = '';
              }}
            />
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={upload.isPending}>
              {upload.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileUp className="h-4 w-4" />
              )}
              {hasTaxCertificate ? t('Replace certificate') : t('Upload certificate')}
            </Button>
          </div>

          {uploadError && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {t('Upload failed. Please try again.')}
            </p>
          )}
        </Panel>
      )}
    </>
  );
}
