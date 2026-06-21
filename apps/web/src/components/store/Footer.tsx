import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Logo } from './Logo';

const COLUMNS: { title: string; links: { label: string; to: string }[] }[] = [
  {
    title: 'Shop',
    links: [
      { label: 'iPhone', to: '/catalog?brand=Apple' },
      { label: 'Samsung Galaxy', to: '/catalog?brand=Samsung' },
      { label: 'Certified Pre-Owned', to: '/catalog?condition=cpo' },
      { label: 'All phones', to: '/catalog' },
    ],
  },
  {
    title: 'Business',
    links: [
      { label: 'Tier pricing', to: '/#tiers' },
      { label: 'Become a reseller', to: '/catalog' },
      { label: 'Suppliers', to: '/catalog' },
      { label: 'Bulk orders', to: '/catalog' },
    ],
  },
  {
    title: 'Support',
    links: [
      { label: 'Contact', to: '/catalog' },
      { label: 'Shipping', to: '/catalog' },
      { label: 'Returns', to: '/catalog' },
      { label: 'FAQ', to: '/catalog' },
    ],
  },
];

const SOCIALS: { label: string; path: string }[] = [
  { label: 'X', path: 'M18.9 2H22l-7 8 8.2 12h-6.4l-5-7-5.7 7H2l7.5-8.6L1.6 2H8l4.5 6.4L18.9 2Z' },
  { label: 'Instagram', path: 'M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Zm0 2a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM17 6.3a1 1 0 1 0 0 2 1 1 0 0 0 0-2ZM7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Zm0 2a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H7Z' },
  { label: 'LinkedIn', path: 'M6.94 5a1.94 1.94 0 1 1-3.88 0 1.94 1.94 0 0 1 3.88 0ZM3.3 8.4h3.3V21H3.3V8.4Zm5.6 0h3.16v1.72h.05c.44-.83 1.5-1.72 3.1-1.72 3.32 0 3.93 2.18 3.93 5.02V21h-3.3v-5.9c0-1.4-.02-3.22-1.96-3.22-1.96 0-2.26 1.53-2.26 3.11V21H8.9V8.4Z' },
];

function FooterColumn({ title, links }: { title: string; links: { label: string; to: string }[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-4 space-y-2.5">
        {links.map((l) => (
          <li key={l.label}>
            <Link to={l.to} className="text-sm text-background/55 transition-colors hover:text-background">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);

  function subscribe(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setDone(true);
  }

  return (
    <footer className="bg-foreground text-background">
      <div className="container py-16">
        <div className="relative overflow-hidden rounded-3xl bg-white/[0.04] p-8 ring-1 ring-white/10 md:p-12">
          <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-brand/20 blur-3xl" aria-hidden />
          <div className="relative grid gap-8 md:grid-cols-2 md:items-center">
            <div>
              <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">Ready to stock up?</h2>
              <p className="mt-3 max-w-md text-background/60">
                Tier pricing, new-arrival drops, and supplier availability alerts. One email a week — no noise.
              </p>
            </div>
            <form onSubmit={subscribe} className="flex w-full max-w-md gap-2 md:ml-auto">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@store.com"
                className="h-12 w-full rounded-full border border-white/15 bg-white/5 px-5 text-sm text-background outline-none placeholder:text-background/40 focus:border-brand"
              />
              <Button type="submit" variant="brand" size="lg" className="shrink-0">
                {done ? <Check className="h-4 w-4" strokeWidth={2.5} /> : 'Notify me'}
              </Button>
            </form>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="container grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-5">
          <div className="sm:col-span-2">
            <Logo invert />
            <p className="mt-4 max-w-xs text-sm text-background/55">
              U.S. mobile devices for consumers, retailers, and wholesale. Real-time supplier inventory,
              tier-based pricing.
            </p>
            <div className="mt-5 flex gap-2">
              {SOCIALS.map((s) => (
                <a
                  key={s.label}
                  href="#"
                  aria-label={s.label}
                  className="grid h-9 w-9 place-items-center rounded-full ring-1 ring-white/15 transition-colors hover:bg-white/10"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
                    <path d={s.path} />
                  </svg>
                </a>
              ))}
            </div>
          </div>
          {COLUMNS.map((c) => (
            <FooterColumn key={c.title} title={c.title} links={c.links} />
          ))}
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="container flex flex-col gap-2 py-6 text-xs text-background/45 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Order My Phones LLC · All rights reserved.</span>
          <span>Mockup demo · Tier pricing · Real-time inventory · Dropship-ready</span>
        </div>
      </div>
    </footer>
  );
}
