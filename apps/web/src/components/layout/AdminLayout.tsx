import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { BarChart3, Bot, Boxes, Flag, LayoutDashboard, LogOut, PackageSearch, Receipt, ScrollText, Settings, Tag, UploadCloud, Users } from 'lucide-react';
import { useAuth, useTier } from '@/store';
import { TIERS } from '@/data/tiers';
import { Logo } from '@/components/store/Logo';
import { LangSwitch } from '@/i18n';
import { PulseDot } from '@/components/store/SyncHeartbeat';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/customers', label: 'Customers', icon: Users },
  { to: '/admin/orders', label: 'Orders', icon: Receipt },
  { to: '/admin/reconciliation', label: 'Reconciliation', icon: PackageSearch, beta: true },
  { to: '/admin/inventory', label: 'Inventory', icon: Boxes },
  { to: '/admin/import', label: 'Import', icon: UploadCloud },
  { to: '/admin/prices', label: 'Prices', icon: Tag, beta: true },
  { to: '/admin/pricing-flags', label: 'Flag queue', icon: Flag, beta: true },
  { to: '/admin/reports', label: 'Reports', icon: BarChart3, soon: true },
  { to: '/admin/api-logs', label: 'API logs', icon: ScrollText, soon: true },
  { to: '/admin/ai', label: 'AI & bots', icon: Bot, soon: true },
  { to: '/admin/config', label: 'Settings', icon: Settings },
] as const;

export default function AdminLayout() {
  const { user, signOut } = useAuth();
  const { startPreview } = useTier();
  const navigate = useNavigate();

  function viewStoreAs(code: string) {
    if (!code) return;
    startPreview(code as (typeof TIERS)[number]['code']);
    navigate('/');
  }

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
            <label className="relative inline-flex items-center">
              <span className="sr-only">View store as tier</span>
              <select
                value=""
                onChange={(e) => viewStoreAs(e.target.value)}
                className="h-8 cursor-pointer appearance-none rounded-full border border-white/15 bg-transparent pl-3 pr-7 text-xs font-medium text-background/80 outline-none transition-colors hover:bg-white/10 [&>option]:text-foreground"
              >
                <option value="" disabled>View store as…</option>
                {TIERS.map((tr) => (
                  <option key={tr.code} value={tr.code}>{tr.short} · {tr.label}</option>
                ))}
              </select>
              <svg className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-background/50" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </label>
            <LangSwitch tone="dark" />
            {user && <span className="hidden font-mono text-xs text-background/50 md:inline">{user.email}</span>}
            <button
              type="button"
              aria-label="Sign out"
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
                end={'end' in l ? l.end : false}
                className={({ isActive }) =>
                  cn(
                    'inline-flex min-h-[42px] items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm transition-colors',
                    isActive ? 'bg-secondary font-medium text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )
                }
              >
                <l.icon className="h-4 w-4" strokeWidth={2} />
                {l.label}
                {'soon' in l && l.soon && (
                  <span className="ml-auto rounded-full bg-brand/10 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-brand">soon</span>
                )}
                {'beta' in l && l.beta && (
                  <span className="ml-auto rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-300">beta</span>
                )}
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
