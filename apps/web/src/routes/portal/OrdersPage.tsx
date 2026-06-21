import { Link } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';
import { useAccount } from '@/store';
import { OrderCard } from '@/components/portal/OrderCard';
import { PageHeading } from '@/components/portal/parts';
import { buttonVariants } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

export default function OrdersPage() {
  const { orders } = useAccount();

  return (
    <div className="space-y-6">
      <PageHeading
        title="Orders"
        subtitle={`${orders.length} ${orders.length === 1 ? 'order' : 'orders'} · newest first`}
      />

      {orders.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border py-16 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-muted">
            <ShoppingBag className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
          </div>
          <div>
            <p className="font-medium">No orders yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Your reserved-at-source orders will land here.</p>
          </div>
          <Link to="/catalog" className={cn(buttonVariants())}>
            Browse catalog
          </Link>
        </div>
      ) : (
        <div className="grid gap-3">
          {orders.map((o, i) => (
            <OrderCard key={o.id} order={o} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
