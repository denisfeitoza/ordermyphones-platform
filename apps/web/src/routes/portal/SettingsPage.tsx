import { useState } from 'react';
import { useAccount } from '@/store';
import { PageHeading, Panel, Field } from '@/components/portal/parts';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

const NOTIFS = [
  { key: 'restock', label: 'Restock alerts', desc: 'When a watched model is back at a supplier' },
  { key: 'price', label: 'Price drops', desc: 'When tier pricing changes on saved models' },
  { key: 'dispatch', label: 'Dispatch updates', desc: 'When a supplier ships part of an order' },
] as const;

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors', on ? 'bg-brand' : 'bg-muted')}
    >
      <span
        className={cn(
          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-soft transition-transform',
          on ? 'translate-x-[22px]' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

export default function SettingsPage() {
  const { businessName } = useAccount();
  const [notifs, setNotifs] = useState<Record<string, boolean>>({ restock: true, price: true, dispatch: true });

  return (
    <div className="space-y-6">
      <PageHeading title="Settings" subtitle="Business profile and notification preferences." />

      <Panel title="Business profile">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Business name" defaultValue={businessName} />
          <Field label="Work email" type="email" defaultValue="ops@downtownmobile.co" />
          <Field label="Reseller permit" defaultValue="TX-RST-4471902" hint="Verified · tax-exempt on qualifying orders" />
          <Field label="Phone" defaultValue="+1 (469) 214-8830" />
        </div>
        <div className="mt-4">
          <Button size="sm">Save changes</Button>
        </div>
      </Panel>

      <Panel title="Notifications">
        <ul className="divide-y divide-border">
          {NOTIFS.map((n) => (
            <li key={n.key} className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
              <div>
                <p className="text-sm font-medium">{n.label}</p>
                <p className="text-xs text-muted-foreground">{n.desc}</p>
              </div>
              <Toggle on={!!notifs[n.key]} onClick={() => setNotifs((p) => ({ ...p, [n.key]: !p[n.key] }))} />
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
