import { useState } from 'react';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useCompanyProfile } from '@/data/companyProfile';
import { exportSalesOrderPdf, type SalesOrderDoc } from '@/lib/salesOrder';
import { useI18n } from '@/i18n';

/** Downloads the order's Sales Order PDF (company details read at click time). */
export function SalesOrderButton({ build, className }: { build: () => SalesOrderDoc; className?: string }) {
  const { t } = useI18n();
  const company = useCompanyProfile();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      className={className}
      disabled={busy || !company.data}
      onClick={() => {
        if (!company.data) return;
        setBusy(true);
        void exportSalesOrderPdf(build(), company.data).finally(() => setBusy(false));
      }}
    >
      <FileText className="h-4 w-4" strokeWidth={2} aria-hidden />
      {t('Sales Order (PDF)')}
    </Button>
  );
}
