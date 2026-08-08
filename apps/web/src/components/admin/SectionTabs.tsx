import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { AdminHeading } from '@/components/admin/parts';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

/**
 * Shared sub-tab bar for admin sections (Prices, Import, Inventory, Customers,
 * Orders, Settings). Co-locates each area's configuration with the area itself:
 * you configure where you work, not in one distant Settings bucket.
 *
 * A tab may carry its own {title, subtitle} — SectionTabs renders that heading
 * above the outlet so config sub-tabs (which have no heading of their own) stay
 * self-orienting. Index tabs that map to a page with its own AdminHeading simply
 * omit title, so nothing doubles up.
 */
export interface SectionTab {
  to: string;
  label: string;
  /** Exact-match only (the section's index route). */
  end?: boolean;
  /** When set, SectionTabs renders an AdminHeading for this tab. */
  title?: string;
  subtitle?: string;
}

export function SectionTabs({ tabs }: { tabs: SectionTab[] }) {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const active =
    tabs.find((tab) => (tab.end ? pathname === tab.to : pathname === tab.to || pathname.startsWith(`${tab.to}/`))) ?? tabs[0];

  return (
    <div className="space-y-6">
      <nav className="scrollbar-hide -mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end ?? false}
            className={({ isActive }) =>
              cn(
                'inline-flex min-h-[40px] shrink-0 items-center whitespace-nowrap rounded-xl px-3.5 py-2 text-sm transition-colors active:scale-[0.98]',
                isActive ? 'bg-secondary font-medium text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )
            }
          >
            {t(tab.label)}
          </NavLink>
        ))}
      </nav>

      {active?.title && <AdminHeading title={t(active.title)} {...(active.subtitle ? { subtitle: t(active.subtitle) } : {})} />}

      <Outlet />
    </div>
  );
}
