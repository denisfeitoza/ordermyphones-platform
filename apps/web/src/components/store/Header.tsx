import { useState, type FormEvent } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Search, ShoppingBag, Menu, X, UserRound } from 'lucide-react';
import { useAuth, useCart, useRealCart, useTier } from '@/store';
import { useCatalogSource } from '@/lib/catalogSource';
import { useI18n, LangSwitch } from '@/i18n';
import { Logo } from './Logo';
import { TierBadge } from './TierBadge';
import { cn } from '@/lib/utils';
import { homePathForRole } from '@/lib/roleRoutes';

const NAV = [
  { to: '/catalog', label: 'Shop' },
  { to: '/catalog?brand=Apple', label: 'iPhone' },
  { to: '/catalog?brand=Samsung', label: 'Samsung' },
  { to: '/catalog?condition=cpo', label: 'Certified Pre-Owned' },
];

export function Header() {
  // Source-aware cart badge: real mode reflects/opens the {variant_id, qty}
  // cart; mock mode is byte-identical to before (source defaults to 'mock').
  const source = useCatalogSource();
  const mockCart = useCart();
  const realCart = useRealCart();
  const isReal = source === 'real';
  const unitCount = isReal ? realCart.unitCount : mockCart.unitCount;
  const openCart = () => (isReal ? realCart.setOpen(true) : mockCart.setOpen(true));
  const { signedIn, role, loading } = useAuth();
  const { tier } = useTier();
  const { t } = useI18n();
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
              {t(l.label)}
            </NavLink>
          ))}
        </nav>

        <form onSubmit={submitSearch} className="ml-auto hidden max-w-xs flex-1 md:block">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={2} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label={t("Search products")}
              placeholder={t("Search iPhone, Galaxy, SKU…")}
              className="h-10 w-full rounded-full border border-border bg-muted/40 pl-9 pr-4 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-brand focus:bg-background"
            />
          </div>
        </form>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <LangSwitch className="hidden md:inline-flex" />
          {signedIn && role === 'customer' && <TierBadge tier={tier} className="hidden sm:inline-flex" />}
          {signedIn && !loading && role ? (
            <Link
              to={homePathForRole(role)}
              className="grid h-10 w-10 place-items-center rounded-full border border-border hover:bg-muted"
              aria-label={role === 'customer' ? t('Your portal') : t('Admin console')}
            >
              <UserRound className="h-[18px] w-[18px]" strokeWidth={2} />
            </Link>
          ) : (
            <Link
              to="/auth/sign-in"
              aria-label={t("Sign in")}
              className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border px-2.5 text-sm font-medium hover:bg-muted sm:px-4"
            >
              <UserRound className="h-[18px] w-[18px] sm:hidden" strokeWidth={2} />
              <span className="hidden sm:inline">{t("Sign in")}</span>
            </Link>
          )}
          <button
            type="button"
            onClick={openCart}
            className="relative grid h-10 w-10 place-items-center rounded-full border border-border hover:bg-muted"
            aria-label={t("Cart")}
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
                  aria-label={t("Search products")}
                  placeholder={t("Search iPhone, Galaxy, SKU…")}
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
                  {t(l.label)}
                </Link>
              ))}
            </nav>
            <div className="flex items-center justify-between border-t border-border pt-3 md:hidden">
              <span className="px-1 text-xs font-medium text-muted-foreground">{t("Language")}</span>
              <LangSwitch />
            </div>
            {signedIn && role === 'customer' && (
              <div className="flex items-center justify-between border-t border-border pt-3 sm:hidden">
                <span className="px-1 text-xs font-medium text-muted-foreground">{t("Your pricing tier")}</span>
                <TierBadge tier={tier} />
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
