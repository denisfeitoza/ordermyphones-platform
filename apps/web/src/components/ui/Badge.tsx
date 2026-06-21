import type { ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badge = cva(
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.7rem] font-medium leading-none',
  {
    variants: {
      tone: {
        neutral: 'bg-secondary text-secondary-foreground',
        brand: 'bg-brand text-white',
        success: 'bg-success/12 text-success',
        warning: 'bg-warning/15 text-warning',
        dark: 'bg-foreground text-background',
        glass: 'bg-background/80 text-foreground backdrop-blur ring-1 ring-border/60',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export function Badge({
  children,
  tone,
  className,
}: VariantProps<typeof badge> & { children: ReactNode; className?: string }) {
  return <span className={cn(badge({ tone }), className)}>{children}</span>;
}

/** Map a catalog badge label to a tone. */
export function badgeTone(label: string): NonNullable<VariantProps<typeof badge>['tone']> {
  if (label === 'Best seller') return 'brand';
  if (label === 'New') return 'success';
  if (label === 'Value pick') return 'warning';
  if (label === 'Certified Pre-Owned') return 'dark';
  return 'neutral';
}
