import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check } from 'lucide-react';
import { useAccount } from '@/store';
import { PageHeading, Panel, Field } from '@/components/portal/parts';
import { ProfileCompletionPanel } from '@/components/portal/ProfileCompletionPanel';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

const PROFILE_KEY = 'omp_profile_v1';
const NOTIFS_KEY = 'omp_notifs_v1';

interface Profile {
  businessName: string;
  email: string;
  permit: string;
  phone: string;
}

const NOTIFS = [
  { key: 'restock', label: 'Restock alerts', desc: 'When a watched model is back in stock' },
  { key: 'price', label: 'Price drops', desc: 'When tier pricing changes on saved models' },
  { key: 'dispatch', label: 'Dispatch updates', desc: 'When a supplier ships part of an order' },
] as const;

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return { ...fallback, ...(JSON.parse(raw) as T) };
  } catch {
    // ignore malformed storage
  }
  return fallback;
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors', on ? 'bg-brand' : 'bg-muted-foreground/30')}
    >
      <span
        className={cn(
          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm ring-1 ring-black/15 transition-transform',
          on ? 'translate-x-[22px]' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

export default function SettingsPage() {
  const { businessName } = useAccount();
  const { t } = useI18n();
  const [profile] = useState<Profile>(() =>
    load(PROFILE_KEY, {
      businessName,
      email: 'billing@downtownmobile.co',
      permit: 'TX-RST-4471902',
      phone: '+1 (469) 214-8830',
    }),
  );
  const [notifs, setNotifs] = useState<Record<string, boolean>>(() =>
    load(NOTIFS_KEY, { restock: true, price: true, dispatch: true }),
  );
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<number | undefined>(undefined);

  // Notification toggles persist immediately — no save button needed for them.
  useEffect(() => {
    try {
      localStorage.setItem(NOTIFS_KEY, JSON.stringify(notifs));
    } catch {
      // ignore
    }
  }, [notifs]);

  useEffect(() => () => window.clearTimeout(savedTimer.current), []);

  function saveProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const next: Profile = {
      businessName: String(fd.get('businessName') ?? ''),
      email: String(fd.get('email') ?? ''),
      permit: String(fd.get('permit') ?? ''),
      phone: String(fd.get('phone') ?? ''),
    };
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
    setSaved(true);
    window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="space-y-6">
      <PageHeading title="Settings" subtitle="Business profile and notification preferences." />

      <ProfileCompletionPanel />

      <Panel title="Business profile">
        <form onSubmit={saveProfile}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Business name" name="businessName" defaultValue={profile.businessName} />
            <Field label="Work email" name="email" type="email" defaultValue={profile.email} />
            <Field label="Reseller permit" name="permit" defaultValue={profile.permit} hint="Verified · tax-exempt on qualifying orders" />
            <Field label="Phone" name="phone" defaultValue={profile.phone} />
          </div>
          <div className="mt-4">
            <Button size="sm" type="submit">
              {saved ? (
                <>
                  <Check className="h-4 w-4" strokeWidth={2.5} /> {t('Saved')}
                </>
              ) : (
                t('Save changes')
              )}
            </Button>
          </div>
        </form>
      </Panel>

      <Panel title="Notifications">
        <ul className="divide-y divide-border">
          {NOTIFS.map((n) => (
            <li key={n.key} className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
              <div>
                <p className="text-sm font-medium">{t(n.label)}</p>
                <p className="text-xs text-muted-foreground">{t(n.desc)}</p>
              </div>
              <Toggle on={!!notifs[n.key]} onClick={() => setNotifs((p) => ({ ...p, [n.key]: !p[n.key] }))} />
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
