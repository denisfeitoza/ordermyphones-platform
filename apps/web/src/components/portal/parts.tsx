import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/i18n';

export function PageHeading({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">{t(title)}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{t(subtitle)}</p>}
      </div>
      {action}
    </div>
  );
}

/** A bordered metric — no card box; grouping comes from the surrounding divide/border (VISUAL_DENSITY 4). */
export function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  const { t } = useI18n();
  return (
    <div className="px-4 py-3">
      <p className="text-xs text-muted-foreground">{t(label)}</p>
      <p className={cn('mt-1 font-mono text-xl font-semibold tabular-nums sm:text-2xl', accent)}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{t(sub)}</p>}
    </div>
  );
}

export function Panel({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  const { t } = useI18n();
  return (
    <section className={cn('rounded-2xl border border-border bg-card', className)}>
      {(title || action) && (
        <header className="flex items-center justify-between border-b border-border px-5 py-3.5">
          {title && <h2 className="text-sm font-medium">{t(title)}</h2>}
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Field({ label, hint, ...props }: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const { t } = useI18n();
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{t(label)}</span>
      <input
        {...props}
        className="h-11 rounded-xl border border-border bg-background px-3.5 text-sm outline-none transition-colors focus:border-brand"
      />
      {hint && <span className="text-xs text-muted-foreground">{t(hint)}</span>}
    </label>
  );
}
