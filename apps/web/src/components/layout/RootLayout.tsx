import { Link, NavLink, Outlet } from 'react-router-dom';
import { cn } from '@/lib/utils';

const navLinks = [
  { to: '/', label: 'Home', end: true },
  { to: '/catalog', label: 'Catalog' },
  { to: '/cart', label: 'Cart' },
  { to: '/portal', label: 'Portal' },
];

export default function RootLayout() {
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="border-b">
        <div className="container flex h-14 items-center justify-between gap-6">
          <Link to="/" className="font-display text-base tracking-tight">
            OrderMyPhones
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            {navLinks.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) =>
                  cn(
                    'px-2 py-1 rounded-md',
                    isActive ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:text-foreground',
                  )
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="container flex-1 py-8">
        <Outlet />
      </main>

      <footer className="border-t">
        <div className="container py-6 text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-2">
          <span>© {new Date().getFullYear()} Order My Phones LLC. All rights reserved.</span>
          <span>Tier-based pricing · Real-time inventory · AI-assisted operations</span>
        </div>
      </footer>
    </div>
  );
}
