import { Quote } from 'lucide-react';
import { LogoMark } from './Logo';

interface Testimonial {
  quote: string;
  name: string;
  company: string;
  initials: string;
}

const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      'Finding high-quality handsets at competitive prices has never been easier thanks to Order My Phones. Their hassle-free sourcing process ensures our retailers always have the inventory they need without delays or complications. OMP continues to be a trusted and valuable partner in our supply chain.',
    name: 'Sonny M',
    company: 'PCG Wireless',
    initials: 'SM',
  },
  {
    quote:
      'Order My Phones has been instrumental in elevating our marketplace by providing exceptional handset solutions. Their commitment to quality and efficiency has significantly enhanced our operations. We highly value our partnership with OMP.',
    name: 'Omar A',
    company: 'RT²',
    initials: 'OA',
  },
  {
    quote:
      'OMP has been a game-changer for our sourcing needs, consistently delivering high-quality devices with exceptional reliability. Their streamlined process and fast turnaround times keep our operations running smoothly. The icing on the cake is their outstanding customer support, ensuring every transaction is seamless and stress-free.',
    name: 'Mahmoud A',
    company: 'Basatne Electronics',
    initials: 'MA',
  },
  {
    quote:
      'The team at OMP has significantly boosted our revenue by providing high-quality handsets that our customers love. Their diligent approach to resolving any challenges ensures a smooth and reliable partnership. We highly value their commitment to excellence.',
    name: 'Owais D.',
    company: 'Xclusive Trading Inc.',
    initials: 'OD',
  },
];

export function Testimonials() {
  return (
    <section className="relative overflow-hidden border-y border-border bg-muted/30">
      <LogoMark className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 opacity-[0.06]" />
      <div className="container relative py-16 md:py-24">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-brand">
            <LogoMark className="h-4 w-4" />
            Testimonials
          </span>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-balance md:text-4xl">
            Trusted across the wholesale channel
          </h2>
          <p className="mt-3 text-muted-foreground">
            Retailers, marketplaces, and distributors source through Order My Phones every day.
          </p>
        </div>

        <div className="mt-10 grid items-start gap-4 md:grid-cols-2">
          {TESTIMONIALS.map((t) => (
            <figure key={t.name + t.company} className="flex h-full flex-col rounded-2xl border border-border bg-card p-6 shadow-soft sm:p-7">
              <Quote className="h-6 w-6 shrink-0 text-brand/70" strokeWidth={2} aria-hidden />
              <blockquote className="mt-3 flex-1 text-pretty text-sm leading-relaxed text-foreground/90">
                {t.quote}
              </blockquote>
              <figcaption className="mt-5 flex items-center gap-3 border-t border-border pt-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-gradient font-mono text-xs font-semibold text-white">
                  {t.initials}
                </span>
                <div>
                  <p className="text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.company}</p>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
