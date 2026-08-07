import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Label + optional help text wrapper for a config input. */
export function Field({ label, help, htmlFor, children }: { label: string; help?: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  );
}

/** Text input styled for the admin shell. */
export function TextInput({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        'h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm outline-none transition-colors focus:border-brand disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    />
  );
}

/** Accessible on/off switch. Touch target ≥ 44px via the wrapping label padding. */
export function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-brand' : 'bg-muted-foreground/30',
      )}
    >
      <span className={cn('inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform', checked ? 'translate-x-5' : 'translate-x-0.5')} />
    </button>
  );
}

/** Money-as-cents input: shows/edits dollars, emits integer cents. */
export function MoneyCentsInput({
  cents,
  onChange,
  disabled,
  ariaLabel,
}: {
  cents: number;
  onChange: (cents: number) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
      <input
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        aria-label={ariaLabel}
        disabled={disabled}
        value={Number.isFinite(cents) ? (cents / 100).toString() : ''}
        onChange={(e) => {
          const dollars = Number(e.target.value);
          onChange(Number.isFinite(dollars) ? Math.round(dollars * 100) : 0);
        }}
        className="h-11 w-full rounded-xl border border-border bg-background pl-7 pr-3 text-sm tabular-nums outline-none transition-colors focus:border-brand disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  );
}

/** Shown atop a panel a staff user may only read. */
export function AdminOnlyNote({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="mb-4 flex items-center gap-2 rounded-xl border border-warning/30 bg-warning/5 px-3.5 py-2.5 text-xs text-warning">
      <Lock className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
      Admin-only settings — you can view these but not change them.
    </div>
  );
}

/** Consistent inline error line for mutations. */
export function MutationError({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p role="alert" className="mt-2 text-sm text-destructive">
      {error instanceof Error ? error.message : 'Something went wrong.'}
    </p>
  );
}

/** Small saved/loading status pill for a mutation. */
export function SaveState({ pending, saved }: { pending: boolean; saved: boolean }) {
  if (pending) return <span className="text-xs text-muted-foreground">Saving…</span>;
  if (saved) return <span className="text-xs text-success">Saved ✓</span>;
  return null;
}
