import { useState, type FormEvent } from 'react';
import { MapPin, Plus, Check } from 'lucide-react';
import { useAccount } from '@/store';
import { PageHeading, Field } from '@/components/portal/parts';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

interface Address {
  id: string;
  label: string;
  recipient: string;
  street: string;
  cityLine: string;
}

export default function AddressesPage() {
  const { businessName } = useAccount();
  const [addresses, setAddresses] = useState<Address[]>([
    { id: 'a1', label: 'Default', recipient: businessName, street: '11816 Inwood Rd #1176', cityLine: 'Dallas, TX 75244' },
  ]);
  const [open, setOpen] = useState(false);

  function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const street = String(f.get('street') ?? '').trim();
    const city = String(f.get('city') ?? '').trim();
    const state = String(f.get('state') ?? '').trim();
    const zip = String(f.get('zip') ?? '').trim();
    if (!street || !city || !state || !zip) return;
    setAddresses((prev) => [
      ...prev,
      {
        id: `a${prev.length + 1}`,
        label: `Location ${prev.length + 1}`,
        recipient: businessName,
        street,
        cityLine: `${city}, ${state} ${zip}`,
      },
    ]);
    setOpen(false);
  }

  return (
    <div className="space-y-6">
      <PageHeading
        title="Addresses"
        subtitle="Where reserved units ship once each supplier dispatches."
        action={
          <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
            <Plus className="h-4 w-4" strokeWidth={2} />
            Add address
          </Button>
        }
      />

      {open && (
        <form onSubmit={add} className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <Field label="Street address" name="street" required placeholder="2400 Victory Ave" />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="City" name="city" required placeholder="Dallas" />
            <Field label="State" name="state" required placeholder="TX" />
            <Field label="ZIP" name="zip" required placeholder="75219" inputMode="numeric" />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm">Save address</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {addresses.map((a) => (
          <div key={a.id} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-muted">
                <MapPin className="h-4 w-4 text-muted-foreground" strokeWidth={2} />
              </span>
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
                  a.label === 'Default' ? 'bg-brand/10 text-brand' : 'bg-muted text-muted-foreground',
                )}
              >
                {a.label === 'Default' && <Check className="h-3 w-3" strokeWidth={3} />}
                {a.label}
              </span>
            </div>
            <p className="mt-3 text-sm font-medium">{a.recipient}</p>
            <p className="text-sm text-muted-foreground">{a.street}</p>
            <p className="text-sm text-muted-foreground">{a.cityLine}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
