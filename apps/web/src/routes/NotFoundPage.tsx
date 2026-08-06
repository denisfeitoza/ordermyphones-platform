import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n';

export default function NotFoundPage() {
  const { t } = useI18n();
  return (
    <section className="space-y-4 max-w-md">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">404</p>
      <h1 className="font-display text-2xl tracking-tight">{t('Page not found')}</h1>
      <p className="text-muted-foreground">
        {t('The page you’re looking for doesn’t exist on OrderMyPhones — yet.')}
      </p>
      <Link to="/" className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm">
        {t('Back to home')}
      </Link>
    </section>
  );
}
