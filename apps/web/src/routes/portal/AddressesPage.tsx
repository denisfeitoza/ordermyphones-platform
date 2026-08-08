import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Plus, Check, Star, Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '@/store';
import { listAddresses, createAddress, updateAddress, deleteAddress, setDefaultAddress, type AddressRow, type AddressInput } from '@/data/addresses';
import { PageHeading, Field } from '@/components/portal/parts';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

type Editing = { id: string | null } | null;

/**
 * Portal → Addresses (#06). A real, server-backed address book (public.addresses,
 * RLS self-scoped) that replaces the old localStorage stub. Saved here, an
 * address is pre-selected at checkout so the buyer never re-types it. Exactly one
 * default is kept by DB trigger; deleting the default promotes the newest left.
 */
export default function AddressesPage() {
  const { t } = useI18n();
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['addresses'], queryFn: listAddresses });
  const addresses = q.data ?? [];

  const [editing, setEditing] = useState<Editing>(null); // {id:null} = new, {id} = editing existing

  const invalidate = () => qc.invalidateQueries({ queryKey: ['addresses'] });
  const save = useMutation({
    mutationFn: async ({ id, input }: { id: string | null; input: AddressInput }) => {
      if (id) await updateAddress(id, input);
      else await createAddress(user!.id, input);
    },
    onSuccess: () => {
      invalidate();
      setEditing(null);
    },
  });
  const remove = useMutation({ mutationFn: (id: string) => deleteAddress(id), onSuccess: invalidate });
  const makeDefault = useMutation({ mutationFn: (id: string) => setDefaultAddress(id), onSuccess: invalidate });

  const editRow = editing?.id ? addresses.find((a) => a.id === editing.id) : undefined;

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const input: AddressInput = {
      label: String(f.get('label') ?? '').trim() || null,
      recipient: String(f.get('recipient') ?? '').trim() || null,
      street: String(f.get('street') ?? '').trim(),
      city: String(f.get('city') ?? '').trim(),
      state: String(f.get('state') ?? '').trim(),
      zip: String(f.get('zip') ?? '').trim(),
      phone: String(f.get('phone') ?? '').trim() || null,
    };
    if (!input.street || !input.city || !input.state || !input.zip) return;
    save.mutate({ id: editing?.id ?? null, input });
  }

  return (
    <div className="space-y-6">
      <PageHeading
        title={t('Addresses')}
        subtitle={t('Save the places you ship to once — the default is pre-selected at checkout.')}
        action={
          !editing && (
            <Button variant="outline" size="sm" onClick={() => setEditing({ id: null })}>
              <Plus className="h-4 w-4" strokeWidth={2} />
              {t('Add address')}
            </Button>
          )
        }
      />

      {editing && (
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Label (optional)" name="label" placeholder={t('Main warehouse')} defaultValue={editRow?.label ?? ''} />
            <Field label="Recipient (optional)" name="recipient" placeholder={profile?.display_name ?? ''} defaultValue={editRow?.recipient ?? profile?.display_name ?? ''} />
          </div>
          <Field label="Street address" name="street" required placeholder="2400 Victory Ave" autoComplete="street-address" defaultValue={editRow?.street ?? ''} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="City" name="city" required placeholder="Dallas" defaultValue={editRow?.city ?? ''} />
            <Field label="State" name="state" required placeholder="TX" defaultValue={editRow?.state ?? ''} />
            <Field label="ZIP" name="zip" required placeholder="75219" inputMode="numeric" defaultValue={editRow?.zip ?? ''} />
          </div>
          <Field label="Phone (optional)" name="phone" type="tel" autoComplete="tel" defaultValue={editRow?.phone ?? ''} />
          {save.error && <p className="text-sm text-destructive">{(save.error as Error).message}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={save.isPending}>
              {save.isPending ? t('Saving…') : editRow ? t('Save changes') : t('Save address')}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(null)}>
              {t('Cancel')}
            </Button>
          </div>
        </form>
      )}

      {q.isLoading ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">{t('Loading…')}</div>
      ) : addresses.length === 0 && !editing ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          {t('No saved addresses yet. Add one and it’s ready the next time you check out.')}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {addresses.map((a: AddressRow) => (
            <div key={a.id} className={cn('rounded-2xl border bg-card p-5', a.is_default ? 'border-brand/40' : 'border-border')}>
              <div className="flex items-start justify-between gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-muted">
                  <MapPin className="h-4 w-4 text-muted-foreground" strokeWidth={2} />
                </span>
                {a.is_default ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2.5 py-1 text-xs font-medium text-brand">
                    <Check className="h-3 w-3" strokeWidth={3} />
                    {t('Default')}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => makeDefault.mutate(a.id)}
                    disabled={makeDefault.isPending}
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Star className="h-3 w-3" strokeWidth={2} />
                    {t('Set default')}
                  </button>
                )}
              </div>
              {a.label && <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{a.label}</p>}
              {a.recipient && <p className="mt-1 text-sm font-medium">{a.recipient}</p>}
              <p className={cn('text-sm', a.recipient ? 'text-muted-foreground' : 'mt-3 font-medium')}>{a.street}</p>
              <p className="text-sm text-muted-foreground">
                {a.city}, {a.state} {a.zip}
              </p>
              {a.phone && <p className="text-sm text-muted-foreground">{a.phone}</p>}
              <div className="mt-3 flex items-center gap-3">
                <button type="button" onClick={() => setEditing({ id: a.id })} className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
                  <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                  {t('Edit')}
                </button>
                <button type="button" onClick={() => remove.mutate(a.id)} disabled={remove.isPending} className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                  {t('Remove')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
