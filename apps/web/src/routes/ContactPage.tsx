import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Check, Mail, MapPin, Phone, Clock, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/i18n';

/** Topic chips → contact_messages.topic (submit_contact_message validates the code). */
const INTENTS = [
  { code: 'tier_pricing', label: 'Tier pricing' },
  { code: 'reseller', label: 'Become a reseller' },
  { code: 'bulk_quote', label: 'Bulk quote' },
  { code: 'order_support', label: 'Order support' },
] as const;
type Intent = (typeof INTENTS)[number];

const ERRORS: Record<string, string> = {
  bad_email: 'Please enter a valid email.',
  too_long: 'Your message is too long. Keep it under 4,000 characters.',
  rate_limited: 'You sent several messages in the last hour. Please wait a little and try again.',
};

const DETAILS = [
  { icon: MapPin, label: 'Warehouse & returns', value: '11816 Inwood Rd #1176', sub: 'Dallas, TX 75244' },
  { icon: Phone, label: 'Sales — Abdu', value: '+1 (469) 214-8830', sub: 'Wholesale & partnerships' },
  { icon: Mail, label: 'Email', value: 'sales@ordermyphones.com', sub: 'We reply by email' },
  { icon: Clock, label: 'Hours', value: 'Mon–Fri · 9–6 CT', sub: 'Orders can be placed 24/7' },
];

/** Contact page: the form files a real message (submit_contact_message RPC,
 * anon-callable, rate-limited); staff read it in Admin → Customers. */
export default function ContactPage() {
  const { t } = useI18n();
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intent, setIntent] = useState<Intent>(INTENTS[0]);
  const [email, setEmail] = useState('');
  const [business, setBusiness] = useState('');
  const [message, setMessage] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSending(true);
    const { error: rpcError } = await supabase.rpc('submit_contact_message', {
      p_email: email,
      p_topic: intent.code,
      p_message: message,
      p_business_name: business || null,
    });
    setSending(false);
    if (rpcError) {
      const code = Object.keys(ERRORS).find((k) => rpcError.message.includes(k));
      setError(t(code ? ERRORS[code] : 'Something went wrong — please try again.'));
      return;
    }
    setSent(true);
    setMessage('');
  }

  return (
    <div className="container py-10 md:py-16">
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        {/* Left — context + reachable channels */}
        <div>
          <span className="text-xs font-semibold uppercase tracking-widest text-brand">{t('Contact')}</span>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-balance md:text-4xl">
            {t('Talk to a human about volume')}
          </h1>
          <p className="mt-3 max-w-md text-muted-foreground">
            {t('Tier pricing, a model we do not list yet, or a problem with an order — tell us what you need and the right person picks it up.')}
          </p>

          <div className="mt-8 divide-y divide-border border-y border-border">
            {DETAILS.map((d) => (
              <div key={d.label} className="flex items-start gap-3.5 py-4">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted">
                  <d.icon className="h-4 w-4 text-muted-foreground" strokeWidth={2} />
                </span>
                <div>
                  <p className="text-xs text-muted-foreground">{t(d.label)}</p>
                  <p className="text-sm font-medium">{d.value}</p>
                  <p className="text-xs text-muted-foreground">{t(d.sub)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right — form / success */}
        <div className="rounded-3xl border border-border bg-card p-6 shadow-card md:p-8">
          {sent ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col items-center gap-4 py-12 text-center"
            >
              <motion.span
                initial={{ scale: 0.6 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 16 }}
                className="grid h-14 w-14 place-items-center rounded-full bg-success text-white"
              >
                <Check className="h-7 w-7" strokeWidth={3} />
              </motion.span>
              <div>
                <p className="font-display text-lg font-semibold">{t('Message received')}</p>
                <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                  {t('Thanks — our team got your message and replies by email.')}
                </p>
              </div>
              <Button variant="outline" onClick={() => setSent(false)}>
                {t('Send another')}
              </Button>
            </motion.div>
          ) : (
            <form onSubmit={submit} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">{t('Work email')}</span>
                  <input
                    type="email"
                    required
                    maxLength={254}
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@store.com"
                    className="h-11 rounded-xl border border-border bg-background px-3.5 text-sm outline-none transition-colors focus:border-brand"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">{t('Business name')}</span>
                  <input
                    maxLength={200}
                    autoComplete="organization"
                    value={business}
                    onChange={(e) => setBusiness(e.target.value)}
                    placeholder={t('Your company')}
                    className="h-11 rounded-xl border border-border bg-background px-3.5 text-sm outline-none transition-colors focus:border-brand"
                  />
                </label>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">{t('I am interested in')}</span>
                <div className="flex flex-wrap gap-2">
                  {INTENTS.map((i) => (
                    <button
                      key={i.code}
                      type="button"
                      aria-pressed={intent.code === i.code}
                      onClick={() => setIntent(i)}
                      className={
                        'min-h-11 rounded-full border px-3.5 py-2 text-sm transition-colors ' +
                        (intent.code === i.code
                          ? 'border-foreground bg-foreground text-background'
                          : 'border-border text-muted-foreground hover:bg-muted')
                      }
                    >
                      {t(i.label)}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">{t('How many units / what do you need?')}</span>
                <textarea
                  required
                  rows={4}
                  maxLength={4000}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t('e.g. 80 iPhone 16 Pro Max monthly, plus a quote on Galaxy S24 Ultra…')}
                  className="rounded-xl border border-border bg-background px-3.5 py-3 text-sm outline-none transition-colors focus:border-brand"
                />
              </label>

              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit" size="lg" className="w-full" disabled={sending}>
                {sending ? t('Sending…') : t('Send message')}
                <ArrowRight className="h-4 w-4" strokeWidth={2} />
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
