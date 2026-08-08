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
      {/* Segmented switcher: an enclosed group with a raised active segment, so
          it reads unmistakably as "these are tabs you click to switch view". */}
      <div className="scrollbar-hide -mx-1 overflow-x-auto px-1 py-0.5">
        <nav className="inline-flex items-center gap-1 rounded-xl border border-border bg-muted/60 p-1">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end ?? false}
              className={({ isActive }) =>
                cn(
                  'inline-flex min-h-[34px] shrink-0 items-center whitespace-nowrap rounded-lg px-4 py-1.5 text-sm transition-all active:scale-[0.97]',
                  isActive
                    ? 'bg-background font-semibold text-foreground shadow-sm ring-1 ring-border/70'
                    : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              {t(tab.label)}
            </NavLink>
          ))}
        </nav>
      </div>

      {active?.title && <AdminHeading title={active.title} {...(active.subtitle ? { subtitle: active.subtitle } : {})} />}

      <Outlet />
    </div>
  );
}
