import { Link } from 'react-router-dom';
import { Truck, RotateCcw, HelpCircle, ArrowRight } from 'lucide-react';
import { buttonVariants } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { useI18n } from '@/i18n';

const SECTIONS = [
  { id: 'shipping', label: 'Shipping', icon: Truck },
  { id: 'returns', label: 'Returns', icon: RotateCcw },
  { id: 'faq', label: 'FAQ', icon: HelpCircle },
];

// Every answer describes what the system actually does today (no online
// payment, staff-reviewed orders, staff-set tiers). Policy specifics such as
// return windows or free shipping are not stated until the business confirms them.
const SHIPPING = [
  ['Shipping method and cost', 'After we review your order, our team confirms the shipping method and cost with you before anything ships.'],
  ['Dispatched from our warehouses', 'Units ship from the warehouse that holds them. An order split across warehouses can arrive in more than one parcel.'],
  ['Tracking', 'When your order ships, the carrier and tracking number appear on the order in your portal.'],
  ['When it ships', 'An order ships after our team approves it and confirms stock. Your order page shows each step.'],
];

const RETURNS = [
  ['How to start a return', 'Open the order in your portal and contact us with the order number and the reason. Our team confirms the return terms for your order.'],
  ['Check the condition first', 'Every listing shows its condition grade (New, Certified Pre-Owned, Grade A to D). Check the grade before you order.'],
];

const FAQ = [
  ['How does ordering work?', 'You build a cart at your tier price and place the order. Nothing is charged on the site. Our team checks stock, approves the order (or the part we can fill) and contacts you to arrange payment and shipping.'],
  ['Do you charge online?', 'No. Payment is arranged with our team after your order is reviewed.'],
  ['How is my tier set?', 'Our team sets your tier from your purchase volume. If your volume changed, contact us and we review it.'],
  ['What is Certified Pre-Owned?', 'Graded, tested devices priced below new. The condition grade shows on every listing.'],
  ['Can I get a custom quote?', 'Yes. Send a bulk quote request from the contact page.'],
];

function Block({ id, title, icon: Icon, children }: { id: string; title: string; icon: typeof Truck; children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <section id={id} className="scroll-mt-28">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-muted">
          <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={2} />
        </span>
        <h2 className="font-display text-xl font-semibold tracking-tight">{t(title)}</h2>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function HelpPage() {
  const { t } = useI18n();
  return (
    <div className="container py-10 md:py-16">
      <header className="max-w-2xl">
        <span className="text-xs font-semibold uppercase tracking-widest text-brand">{t('Help center')}</span>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight md:text-4xl">{t('Shipping, returns & answers')}</h1>
        <p className="mt-3 text-muted-foreground">
          {t('How orders move, how returns start, and how tier pricing works.')}
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
              {t(s.label)}
            </a>
          ))}
        </nav>

        <div className="max-w-2xl space-y-12">
          <Block id="shipping" title="Shipping" icon={Truck}>
            <dl className="divide-y divide-border border-y border-border">
              {SHIPPING.map(([q, a]) => (
                <div key={q} className="grid gap-1 py-4 sm:grid-cols-[200px_1fr] sm:gap-6">
                  <dt className="text-sm font-medium">{t(q)}</dt>
                  <dd className="text-sm text-muted-foreground">{t(a)}</dd>
                </div>
              ))}
            </dl>
          </Block>

          <Block id="returns" title="Returns" icon={RotateCcw}>
            <dl className="divide-y divide-border border-y border-border">
              {RETURNS.map(([q, a]) => (
                <div key={q} className="grid gap-1 py-4 sm:grid-cols-[200px_1fr] sm:gap-6">
                  <dt className="text-sm font-medium">{t(q)}</dt>
                  <dd className="text-sm text-muted-foreground">{t(a)}</dd>
                </div>
              ))}
            </dl>
          </Block>

          <Block id="faq" title="FAQ" icon={HelpCircle}>
            <div className="space-y-3">
              {FAQ.map(([q, a]) => (
                <details key={q} className="group rounded-2xl border border-border bg-card p-4 [&_summary]:cursor-pointer">
                  <summary className="flex items-center justify-between gap-3 text-sm font-medium marker:content-none">
                    {t(q)}
                    <span className="text-lg leading-none text-muted-foreground transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-2.5 text-sm text-muted-foreground">{t(a)}</p>
                </details>
              ))}
            </div>
          </Block>

          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-muted/30 p-5">
            <p className="flex-1 text-sm text-muted-foreground">{t('Did not find it? Send us a message.')}</p>
            <Link to="/contact" className={cn(buttonVariants({ size: 'sm' }))}>
              {t('Contact us')}
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
