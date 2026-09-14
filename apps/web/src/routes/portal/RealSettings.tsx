import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useAuth } from '@/store';
import { supabase } from '@/lib/supabase';
import { PageHeading, Panel, Field } from '@/components/portal/parts';
import { ProfileCompletionPanel } from '@/components/portal/ProfileCompletionPanel';
import { Button } from '@/components/ui/Button';
import { DB_TIER_LABELS } from '@/lib/invites';
import { useI18n } from '@/i18n';

/**
 * Real-mode account settings — reads and writes the signed-in customer's own
 * `profiles` row (RLS: self; column grant: display_name, phone, locale,
 * shipping_address). Replaces the mock "Downtown Mobile" profile a real
 * customer used to see (audit 2026-09-13 P0-5). E-mail is the login and is
 * changed through the auth flow, not here.
 */

interface ProfileRow {
  email: string;
  display_name: string | null;
  phone: string | null;
  shipping_address: { street?: string; city?: string; state?: string; zip?: string } | null;
}

function useMyProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ['my-profile-settings', userId],
    enabled: !!userId,
    queryFn: async (): Promise<ProfileRow> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('email, display_name, phone, shipping_address')
        .eq('id', userId!)
        .single();
      if (error) throw new Error(error.message);
      return data as ProfileRow;
    },
  });
}

export function RealSettings() {
  const { t } = useI18n();
  const { user, profile: authProfile } = useAuth();
  const qc = useQueryClient();
  const q = useMyProfile(user?.id);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(savedTimer.current), []);

  const save = useMutation({
    mutationFn: async (next: { display_name: string; phone: string; shipping_address: ProfileRow['shipping_address'] }) => {
      if (!user) throw new Error('not signed in');
      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: next.display_name.trim() || null,
          phone: next.phone.trim() || null,
          shipping_address: next.shipping_address,
        })
        .eq('id', user.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['my-profile-settings'] });
      void qc.invalidateQueries({ queryKey: ['profile'] });
      void qc.invalidateQueries({ queryKey: ['profile-contact'] });
      setSaved(true);
      window.clearTimeout(savedTimer.current);
      savedTimer.current = window.setTimeout(() => setSaved(false), 2000);
    },
  });

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const str = (k: string) => String(fd.get(k) ?? '').trim();
    const addr = { street: str('street'), city: str('city'), state: str('state'), zip: str('zip') };
    const hasAddr = Object.values(addr).some(Boolean);
    save.mutate({ display_name: str('display_name'), phone: str('phone'), shipping_address: hasAddr ? addr : null });
  }

  const p = q.data;
  const tierLabel = authProfile?.tier ? DB_TIER_LABELS[authProfile.tier] : null;

  return (
    <div className="space-y-6">
      <PageHeading title="Settings" subtitle="Your account details and default shipping address." />

      <ProfileCompletionPanel />

      <Panel title="Account">
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">{t('Loading…')}</p>
        ) : q.isError || !p ? (
          <p className="text-sm text-destructive">{t('Could not load your profile.')}</p>
        ) : (
          <form key={`${p.display_name ?? ''}|${p.phone ?? ''}`} onSubmit={submit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name or business" name="display_name" defaultValue={p.display_name ?? ''} autoComplete="organization" />
              <Field label="Phone" name="phone" type="tel" defaultValue={p.phone ?? ''} autoComplete="tel" />
              <Field label="Sign-in e-mail" name="email" type="email" value={p.email} readOnly hint={t('Used to sign in — contact us to change it.')} />
              <Field label="Pricing tier" name="tier" value={tierLabel ?? '—'} readOnly hint={t('Set by our team when your account was approved.')} />
            </div>
            <h3 className="mb-3 mt-6 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('Default shipping address')}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Street address" name="street" defaultValue={p.shipping_address?.street ?? ''} autoComplete="street-address" />
              </div>
              <Field label="City" name="city" defaultValue={p.shipping_address?.city ?? ''} autoComplete="address-level2" />
              <div className="grid grid-cols-2 gap-4">
                <Field label="State" name="state" defaultValue={p.shipping_address?.state ?? ''} autoComplete="address-level1" />
                <Field label="ZIP" name="zip" defaultValue={p.shipping_address?.zip ?? ''} autoComplete="postal-code" />
              </div>
            </div>
            {save.isError && (
              <p className="mt-3 text-sm text-destructive">{save.error instanceof Error ? save.error.message : t('Could not save.')}</p>
            )}
            <div className="mt-4">
              <Button size="sm" type="submit" disabled={save.isPending}>
                {saved ? (
                  <>
                    <Check className="h-4 w-4" strokeWidth={2.5} /> {t('Saved')}
                  </>
                ) : save.isPending ? (
                  t('Saving…')
                ) : (
                  t('Save changes')
                )}
              </Button>
            </div>
          </form>
        )}
      </Panel>
    </div>
  );
}
