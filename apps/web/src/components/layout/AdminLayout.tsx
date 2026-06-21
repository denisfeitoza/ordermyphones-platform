import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ArrowUpRight, BarChart3, Bot, Boxes, LayoutDashboard, LogOut, Receipt, ScrollText, Tag, Users } from 'lucide-react';
import { useAuth } from '@/store';
import { Logo } from '@/components/store/Logo';
import { PulseDot } from '@/components/store/SyncHeartbeat';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/customers', label: 'Customers', icon: Users },
  { to: '/admin/orders', label: 'Orders', icon: Receipt },
  { to: '/admin/inventory', label: 'Inventory', icon: Boxes },
  { to: '/admin/prices', label: 'Prices', icon: Tag },
  { to: '/admin/api-logs', label: 'API logs', icon: ScrollText },
  { to: '/admin/ai', label: 'AI & bots', icon: Bot },
  { to: '/admin/reports', label: 'Reports', icon: BarChart3 },
];

export default function AdminLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-dvh bg-muted/20">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-foreground text-background">
        <div className="mx-auto flex h-14 max-w-[1500px] items-center gap-4 px-4">
          <Logo invert />
          <span className="hidden items-center gap-2 border-l border-white/15 pl-4 text-sm text-background/70 sm:flex">
            <PulseDot />
            Admin console
          </span>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <Link
              to="/portal"
              className="inline-flex items-center gap-1 rounded-full border border-white/15 px-3 py-1.5 text-xs font-medium text-background/80 transition-colors hover:bg-white/10"
            >
              Customer portal
              <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} />
            </Link>
            {user && <span className="hidden font-mono text-xs text-background/50 md:inline">{user.email}</span>}
            <button
              type="button"
              onClick={() => {
                signOut();
                navigate('/');
              }}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs text-background/70 transition-colors hover:bg-white/10"
            >
              <LogOut className="h-3.5 w-3.5" strokeWidth={2} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] gap-6 px-4 py-6 lg:grid lg:grid-cols-[208px_1fr]">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <nav className="scrollbar-hide -mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {NAV.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end ?? false}
                className={({ isActive }) =>
                  cn(
                    'inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm transition-colors',
                    isActive ? 'bg-secondary font-medium text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )
                }
              >
                <l.icon className="h-4 w-4" strokeWidth={2} />
                {l.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 pt-4 lg:pt-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
