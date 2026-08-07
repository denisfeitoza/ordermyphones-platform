import { Link } from 'react-router-dom';
import { MailPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { buttonVariants } from '@/components/ui/Button';
import { useI18n } from '@/i18n';

export default function SignUpPage() {
  const { t } = useI18n();

  return (
    <AuthLayout
      title="Accounts are invite-only"
      subtitle="OrderMyPhones is a closed B2B marketplace — every account is created by the OrderMyPhones team."
      footer={
        <>
          {t('Already have an account?')}{' '}
          <Link to="/auth/sign-in" className="font-medium text-brand hover:underline">
            {t('Sign in')}
          </Link>
        </>
      }
    >
      <div className="space-y-4 rounded-2xl border border-border bg-muted/30 p-5 text-sm text-muted-foreground">
        <p>
          {t(
            'There is no open sign-up. If you sell phones at volume, tell us about your business and we’ll set up your account and tier pricing.',
          )}
        </p>
        <Link
          to="/contact"
          className={cn(buttonVariants({ size: 'md' }), 'w-full')}
        >
          <MailPlus className="h-4 w-4" strokeWidth={2} />
          {t('Request an invite')}
        </Link>
      </div>
    </AuthLayout>
  );
}
