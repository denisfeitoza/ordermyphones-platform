import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

export function Logo({ className, invert = false }: { className?: string; invert?: boolean }) {
  return (
    <Link to="/" className={cn('inline-flex items-center gap-2', className)} aria-label="OrderMyPhones home">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-gradient text-white">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden>
          <rect x="6" y="2.5" width="12" height="19" rx="3" stroke="currentColor" strokeWidth="1.8" />
          <path d="M10.5 18.5h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </span>
      <span className={cn('text-base font-semibold tracking-tight', invert ? 'text-background' : 'text-foreground')}>
        Order<span className="font-normal text-muted-foreground">MyPhones</span>
      </span>
    </Link>
  );
}
