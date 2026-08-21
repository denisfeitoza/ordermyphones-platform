import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useAuth } from '@/store';
import { useHomeContent, HOME_ICONS } from '@/data/homeContent';
import { useI18n } from '@/i18n';

/** Slim benefits/engagement bar above the hero. Admin-configurable
 *  (home_content.benefits); the sign-in/access CTA shows for guests only. */
export function BenefitsBar() {
  const { t } = useI18n();
  const { data } = useHomeContent();
  const { signedIn } = useAuth();
  const b = data?.benefits;
  if (!b?.enabled || b.items.length === 0) return null;

  return (
    <div className="border-b border-border bg-secondary/50">
      <div className="container flex flex-wrap items-center justify-center gap-x-6 gap-y-2 py-2.5 text-sm sm:justify-between">
        <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1.5">
          {b.items.map((item, i) => {
            const Icon = HOME_ICONS[item.icon] ?? Sparkles;
            return (
              <li key={i} className="inline-flex items-center gap-1.5">
                <Icon className="h-4 w-4 shrink-0 text-brand" strokeWidth={2} aria-hidden />
                <span className="font-medium">{t(item.text)}</span>
              </li>
            );
          })}
        </ul>
        {!signedIn && b.ctaLabel && (
          <Link to={b.ctaHref} className="inline-flex shrink-0 items-center gap-1 font-medium text-brand transition-all hover:gap-1.5">
            {t(b.ctaLabel)}
            <ArrowRight className="h-4 w-4" strokeWidth={2} />
          </Link>
        )}
      </div>
    </div>
  );
}
