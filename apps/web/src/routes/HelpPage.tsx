import { Link } from 'react-router-dom';
import { Truck, RotateCcw, HelpCircle, ArrowRight } from 'lucide-react';
import { buttonVariants } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

const SECTIONS = [
  { id: 'shipping', label: 'Shipping', icon: Truck },
  { id: 'returns', label: 'Returns', icon: RotateCcw },
  { id: 'faq', label: 'FAQ', icon: HelpCircle },
];

const SHIPPING = [
  ['Free U.S. shipping', 'Every order ships free within the contiguous U.S. — the price you see at your tier is the price you pay.'],
  ['Dispatched from source', 'Once units are reserved at a supplier, that supplier dispatches directly. Split orders can arrive in more than one parcel.'],
  ['Tracking per supplier', 'Each dispatch posts its own tracking to your portal as it leaves — watch it under Orders.'],
  ['Lead times', 'New stock typically ships in 1–2 business days. Certified Pre-Owned is graded and tested first, usually 2–4 business days.'],
];

const RETURNS = [
  ['14-day window — new', 'Unopened new devices can be returned within 14 days of delivery for a full refund to the original method.'],
  ['Certified Pre-Owned', 'CPO units carry a 30-day functional warranty. Dead-on-arrival units are replaced or refunded, no restocking fee.'],
  ['How to start one', 'Open the order in your portal and contact us for an RMA number — refunds settle once the unit is scanned back in.'],
];

const FAQ = [
  ['How does “reserve at source” work?', 'When you place an order, the inventory bot re-checks live stock at each supplier, cross-references open orders, and holds your exact units before any charge — so you never pay for stock we can’t secure.'],
  ['When does my tier move up?', 'Tiers are driven by cumulative purchase volume and never reset. Cross a threshold and the new discount applies to your next order automatically — no quotes, no rep.'],
  ['Do you charge before reserving?', 'No. Payment is authorized only after units are confirmed and held at source. If a hold fails, nothing is charged.'],
  ['What is Certified Pre-Owned?', 'Graded, fully tested devices with a 30-day functional warranty — priced below new, with condition shown on every listing.'],
  ['Can I get net terms or a custom quote?', 'Yes, beyond Wholesale we set up net terms and dedicated pricing. Reach the sales desk from the contact page.'],
];

function Block({ id, title, icon: Icon, children }: { id: string; title: string; icon: typeof Truck; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-muted">
          <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={2} />
        </span>
        <h2 className="font-display text-xl font-semibold tracking-tight">{title}</h2>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function HelpPage() {
  return (
    <div className="container py-10 md:py-16">
      <header className="max-w-2xl">
        <span className="text-xs font-semibold uppercase tracking-widest text-brand">Help center</span>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight md:text-4xl">Shipping, returns & answers</h1>
        <p className="mt-3 text-muted-foreground">
          The essentials on how orders move, how returns work, and how tier pricing behaves.
        </p>
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-[200px_1fr] lg:gap-16">
        {/* Sticky anchor nav */}
        <nav className="scrollbar-hide -mx-1 flex gap-1 overflow-x-auto px-1 lg:sticky lg:top-28 lg:mx-0 lg:h-fit lg:flex-col lg:overflow-visible lg:px-0">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <s.icon className="h-4 w-4" strokeWidth={2} />
              {s.label}
            </a>
          ))}
        </nav>

        <div className="max-w-2xl space-y-12">
          <Block id="shipping" title="Shipping" icon={Truck}>
            <dl className="divide-y divide-border border-y border-border">
              {SHIPPING.map(([q, a]) => (
                <div key={q} className="grid gap-1 py-4 sm:grid-cols-[200px_1fr] sm:gap-6">
                  <dt className="text-sm font-medium">{q}</dt>
                  <dd className="text-sm text-muted-foreground">{a}</dd>
                </div>
              ))}
            </dl>
          </Block>

          <Block id="returns" title="Returns" icon={RotateCcw}>
            <dl className="divide-y divide-border border-y border-border">
              {RETURNS.map(([q, a]) => (
                <div key={q} className="grid gap-1 py-4 sm:grid-cols-[200px_1fr] sm:gap-6">
                  <dt className="text-sm font-medium">{q}</dt>
                  <dd className="text-sm text-muted-foreground">{a}</dd>
                </div>
              ))}
            </dl>
          </Block>

          <Block id="faq" title="FAQ" icon={HelpCircle}>
            <div className="space-y-3">
              {FAQ.map(([q, a]) => (
                <details key={q} className="group rounded-2xl border border-border bg-card p-4 [&_summary]:cursor-pointer">
                  <summary className="flex items-center justify-between gap-3 text-sm font-medium marker:content-none">
                    {q}
                    <span className="text-muted-foreground transition-transform group-open:rotate-45">＋</span>
                  </summary>
                  <p className="mt-2.5 text-sm text-muted-foreground">{a}</p>
                </details>
              ))}
            </div>
          </Block>

          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-muted/30 p-5">
            <p className="flex-1 text-sm text-muted-foreground">Didn&apos;t find it? The team answers within a business day.</p>
            <Link to="/contact" className={cn(buttonVariants({ size: 'sm' }))}>
              Contact us
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
