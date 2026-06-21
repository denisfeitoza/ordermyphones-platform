import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Check, Mail, MapPin, Phone, Clock, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';

const INTENTS = ['Tier pricing', 'Become a reseller', 'Bulk quote', 'Order support'] as const;

const DETAILS = [
  { icon: MapPin, label: 'Warehouse & returns', value: '11816 Inwood Rd #1176', sub: 'Dallas, TX 75244' },
  { icon: Phone, label: 'Sales — Abdu', value: '+1 (469) 214-8830', sub: 'Wholesale & partnerships' },
  { icon: Mail, label: 'Email', value: 'sales@ordermyphones.com', sub: 'Replies within one business day' },
  { icon: Clock, label: 'Hours', value: 'Mon–Fri · 9–6 CT', sub: 'Reservations process 24/7' },
];

export default function ContactPage() {
  const [sent, setSent] = useState(false);
  const [intent, setIntent] = useState<(typeof INTENTS)[number]>('Tier pricing');

  function submit(e: FormEvent) {
    e.preventDefault();
    setSent(true);
  }

  return (
    <div className="container py-10 md:py-16">
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        {/* Left — context + reachable channels */}
        <div>
          <span className="text-xs font-semibold uppercase tracking-widest text-brand">Contact</span>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-balance md:text-4xl">
            Talk to a human about volume
          </h1>
          <p className="mt-3 max-w-md text-muted-foreground">
            Tier pricing, net terms, a model we don&apos;t list yet, or a problem with an order — tell us what you need
            and the right person picks it up.
          </p>

          <div className="mt-8 divide-y divide-border border-y border-border">
            {DETAILS.map((d) => (
              <div key={d.label} className="flex items-start gap-3.5 py-4">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted">
                  <d.icon className="h-4 w-4 text-muted-foreground" strokeWidth={2} />
                </span>
                <div>
                  <p className="text-xs text-muted-foreground">{d.label}</p>
                  <p className="text-sm font-medium">{d.value}</p>
                  <p className="text-xs text-muted-foreground">{d.sub}</p>
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
                <p className="font-display text-lg font-semibold">Message received</p>
                <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                  We routed it to the {intent.toLowerCase()} desk. Expect a reply within one business day.
                </p>
              </div>
              <Button variant="outline" onClick={() => setSent(false)}>
                Send another
              </Button>
            </motion.div>
          ) : (
            <form onSubmit={submit} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">Work email</span>
                  <input
                    type="email"
                    required
                    placeholder="you@store.com"
                    className="h-11 rounded-xl border border-border bg-background px-3.5 text-sm outline-none transition-colors focus:border-brand"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">Business name</span>
                  <input
                    required
                    placeholder="Downtown Mobile LLC"
                    className="h-11 rounded-xl border border-border bg-background px-3.5 text-sm outline-none transition-colors focus:border-brand"
                  />
                </label>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">I&apos;m interested in</span>
                <div className="flex flex-wrap gap-2">
                  {INTENTS.map((i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setIntent(i)}
                      className={
                        'rounded-full border px-3.5 py-2 text-sm transition-colors ' +
                        (intent === i
                          ? 'border-foreground bg-foreground text-background'
                          : 'border-border text-muted-foreground hover:bg-muted')
                      }
                    >
                      {i}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">How many units / what do you need?</span>
                <textarea
                  required
                  rows={4}
                  placeholder="e.g. 80 iPhone 16 Pro Max monthly, plus a quote on Galaxy S24 Ultra…"
                  className="rounded-xl border border-border bg-background px-3.5 py-3 text-sm outline-none transition-colors focus:border-brand"
                />
              </label>

              <Button type="submit" size="lg" className="w-full">
                Send message
                <ArrowRight className="h-4 w-4" strokeWidth={2} />
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Mockup form — submissions aren&apos;t stored or sent.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
