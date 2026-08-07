import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n';

/**
 * Public "request access" intake (go-live). OMP is invite-only — an anonymous
 * visitor can't see tier prices or order. This form collects their details and
 * files a request (submit_access_request RPC, anon-callable, SECURITY DEFINER);
 * an admin reviews it and sends a tier-scoped invite. Prices and quantities stay
 * hidden until they accept the invite and sign in.
 */
const TIER_OPTIONS = [
  { value: '', label: 'Not sure yet' },
  { value: 'consumer', label: 'Consumer — a few units' },
  { value: 'retailer', label: 'Retailer — 10–49 units' },
  { value: 'wholesale', label: 'Wholesale — 50–399 units' },
  { value: 'distributor', label: 'Distributor — 400+ units' },
];

function Field({ label, required, ...props }: { label: string; required?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  const { t } = useI18n();
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">
        {t(label)} {required && <span className="text-brand">*</span>}
      </span>
      <input {...props} className="h-11 rounded-xl border border-border bg-background px-3.5 text-sm outline-none transition-colors focus:border-brand" />
    </label>
  );
}

export default function RequestAccessPage() {
  const { t } = useI18n();
  const [form, setForm] = useState({ full_name: '', business_name: '', email: '', phone: '', tier_interest: '', note: '' });
  const [phase, setPhase] = useState<'form' | 'sending' | 'done'>('form');
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPhase('sending');
    const { error: rpcError } = await supabase.rpc('submit_access_request', {
      p_full_name: form.full_name,
      p_email: form.email,
      p_business_name: form.business_name || null,
      p_phone: form.phone || null,
      p_tier_interest: form.tier_interest || null,
      p_note: form.note || null,
    });
    if (rpcError) {
      setError(rpcError.message.includes('bad_email') ? t('Please enter a valid email.') : t('Something went wrong — please try again.'));
      setPhase('form');
      return;
    }
    setPhase('done');
  }

  if (phase === 'done') {
    return (
      <div className="container flex min-h-[70vh] flex-col items-center justify-center py-16 text-center">
        <span className="mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-success/10 text-success">
          <CheckCircle2 className="h-8 w-8" strokeWidth={1.75} />
        </span>
        <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">{t('Request received')}</h1>
        <p className="mt-3 max-w-md text-muted-foreground">
          {t('Thanks! Our team will review your request and email you an invite with your account and pricing tier. Prices and quantities unlock once you accept it and sign in.')}
        </p>
        <Link to="/" className="mt-8">
          <Button variant="outline">{t('Back to home')}</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container max-w-xl py-12 md:py-16">
      <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">{t('Request an account')}</h1>
      <p className="mt-3 text-muted-foreground">
        {t('OrderMyPhones is invite-only. Tell us a little about you and we’ll set up your account with the right pricing tier. You’ll see live prices and quantities once you’re approved and signed in.')}
      </p>

      <form onSubmit={submit} className="mt-8 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" required autoComplete="name" value={form.full_name} onChange={set('full_name')} />
          <Field label="Business name" autoComplete="organization" value={form.business_name} onChange={set('business_name')} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Work email" required type="email" autoComplete="email" value={form.email} onChange={set('email')} />
          <Field label="Phone" type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} />
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t('Expected volume')}</span>
          <select
            value={form.tier_interest}
            onChange={set('tier_interest')}
            className="h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-brand"
          >
            {TIER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{t(o.label)}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t('Anything else? (optional)')}</span>
          <textarea
            rows={3}
            value={form.note}
            onChange={set('note')}
            className="resize-y rounded-xl border border-border bg-background p-3 text-sm outline-none transition-colors focus:border-brand"
          />
        </label>

        {error && <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p>}

        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={phase === 'sending'}>
          {phase === 'sending' ? t('Sending…') : t('Request access')}
          {phase !== 'sending' && <ArrowRight className="h-4 w-4" strokeWidth={2} />}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          {t('Already invited?')}{' '}
          <Link to="/auth/sign-in" className="font-medium text-brand hover:underline">{t('Sign in')}</Link>
        </p>
      </form>
    </div>
  );
}
