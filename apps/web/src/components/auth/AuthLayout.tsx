import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Eye, EyeOff, Layers, ShieldCheck, Zap } from 'lucide-react';
import { Logo } from '@/components/store/Logo';
import { useI18n } from '@/i18n';

const POINTS = [
  { icon: Zap, title: 'Reserve at source', desc: 'Stock is confirmed and held at the supplier before you’re charged.' },
  { icon: Layers, title: 'Tier pricing, automatic', desc: 'Your account price is applied at checkout — no codes, no quotes.' },
  { icon: ShieldCheck, title: 'Two live supplier feeds', desc: 'Anonymized sources, cross-checked every two seconds.' },
];

/** Split-screen auth shell: branded value panel (lg+) + the form column. */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-foreground p-10 text-background lg:flex">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand/20 blur-3xl" aria-hidden />
        <Logo invert />
        <div className="relative max-w-sm">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-balance">
            {t('The B2B way to buy iPhone & Galaxy in volume.')}
          </h2>
          <ul className="mt-8 space-y-5">
            {POINTS.map((p) => (
              <li key={p.title} className="flex gap-3.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10">
                  <p.icon className="h-4 w-4" strokeWidth={2} />
                </span>
                <div>
                  <p className="text-sm font-medium">{t(p.title)}</p>
                  <p className="text-sm text-background/60">{t(p.desc)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-background/40">{t('Mockup demo')} · Order My Phones LLC</p>
      </aside>

      <main className="flex flex-col justify-center px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{t(title)}</h1>
          {subtitle && <p className="mt-2 text-sm text-muted-foreground">{t(subtitle)}</p>}
          <div className="mt-7">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-muted-foreground sm:text-left">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

export function AuthField({
  label,
  hint,
  ...props
}: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
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

export function PasswordField({ label, hint, ...props }: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{t(label)}</span>
      <div className="relative">
        <input
          {...props}
          type={show ? 'text' : 'password'}
          className="h-11 w-full rounded-xl border border-border bg-background pl-3.5 pr-11 text-sm outline-none transition-colors focus:border-brand"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={show ? t('Hide password') : t('Show password')}
        >
          {show ? <EyeOff className="h-4 w-4" strokeWidth={2} /> : <Eye className="h-4 w-4" strokeWidth={2} />}
        </button>
      </div>
      {hint && <span className="text-xs text-muted-foreground">{t(hint)}</span>}
    </label>
  );
}
