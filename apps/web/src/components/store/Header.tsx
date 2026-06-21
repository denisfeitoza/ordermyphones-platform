import { useState, type FormEvent } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Search, ShoppingBag, Menu, X, UserRound } from 'lucide-react';
import { useCart } from '@/store';
import { Logo } from './Logo';
import { TierSwitcher } from './TierSwitcher';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/catalog', label: 'Shop' },
  { to: '/catalog?brand=Apple', label: 'iPhone' },
  { to: '/catalog?brand=Samsung', label: 'Samsung' },
  { to: '/catalog?condition=cpo', label: 'Certified Pre-Owned' },
];

export function Header() {
  const { unitCount, setOpen } = useCart();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  function submitSearch(e: FormEvent) {
    e.preventDefault();
    navigate(q.trim() ? `/catalog?q=${encodeURIComponent(q.trim())}` : '/catalog');
    setMenuOpen(false);
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="container flex h-16 items-center gap-4">
        <button
          type="button"
          className="-ml-2 grid h-10 w-10 place-items-center rounded-full hover:bg-muted lg:hidden"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Menu"
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        <Logo />

        <nav className="ml-2 hidden items-center gap-1 lg:flex">
          {NAV.map((l) => (
            <NavLink
              key={l.label}
              to={l.to}
              className={({ isActive }) =>
                cn(
                  'rounded-full px-3 py-1.5 text-sm transition-colors',
                  isActive ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        <form onSubmit={submitSearch} className="ml-auto hidden max-w-xs flex-1 md:block">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={2} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search iPhone, Galaxy, SKU…"
              className="h-10 w-full rounded-full border border-border bg-muted/40 pl-9 pr-4 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-brand focus:bg-background"
            />
          </div>
        </form>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <TierSwitcher />
          <Link
            to="/portal"
            className="grid h-10 w-10 place-items-center rounded-full border border-border hover:bg-muted"
            aria-label="Your account"
          >
            <UserRound className="h-[18px] w-[18px]" strokeWidth={2} />
          </Link>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="relative grid h-10 w-10 place-items-center rounded-full border border-border hover:bg-muted"
            aria-label="Cart"
          >
            <ShoppingBag className="h-[18px] w-[18px]" strokeWidth={2} />
            {unitCount > 0 && (
              <span className="absolute -right-1 -top-1 grid h-5 min-w-[20px] place-items-center rounded-full bg-brand px-1 font-mono text-[0.65rem] font-semibold text-white">
                {unitCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="border-t border-border bg-background lg:hidden">
          <div className="container space-y-3 py-4">
            <form onSubmit={submitSearch}>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={2} />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search iPhone, Galaxy, SKU…"
                  className="h-11 w-full rounded-full border border-border bg-muted/40 pl-9 pr-4 text-sm outline-none focus:border-brand focus:bg-background"
                />
              </div>
            </form>
            <nav className="grid">
              {NAV.map((l) => (
                <Link
                  key={l.label}
                  to={l.to}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-xl px-3 py-2.5 text-sm hover:bg-muted"
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}
