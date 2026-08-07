import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { AdminHeading } from '@/components/admin/parts';

/**
 * Honest "not in v1 yet" state for admin surfaces that are still chrome/mock
 * (Reports, AI & bots, API logs). Shown only in REAL mode — mock mode keeps the
 * polished preview chrome as the product vision. This makes sure a client
 * clicking around a live handover never sees fabricated numbers behind a "live"
 * label: the page says plainly what it is and what's coming.
 */
export function PreviewNotice({
  title,
  subtitle,
  blurb,
  bullets,
  icon,
}: {
  title: string;
  subtitle: string;
  blurb: string;
  bullets?: string[];
  icon?: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <AdminHeading title={title} subtitle={subtitle} />
      <div className="mx-auto max-w-xl rounded-2xl border border-dashed border-border bg-card p-8 text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand/10 text-brand">
          {icon ?? <Sparkles className="h-6 w-6" strokeWidth={1.75} />}
        </div>
        <span className="inline-flex items-center rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand">
          On the roadmap
        </span>
        <p className="mx-auto mt-4 max-w-md text-sm text-muted-foreground">{blurb}</p>
        {bullets && bullets.length > 0 && (
          <ul className="mx-auto mt-5 max-w-sm space-y-2 text-left">
            {bullets.map((b) => (
              <li key={b} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand/60" />
                {b}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
