import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap transition-all duration-200 ease-spring active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background select-none',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-soft',
        brand: 'bg-brand text-white hover:brightness-110 shadow-soft',
        outline: 'border border-border bg-background hover:bg-muted text-foreground',
        ghost: 'text-foreground hover:bg-muted',
        subtle: 'bg-secondary text-secondary-foreground hover:bg-muted',
      },
      size: {
        sm: 'h-9 px-4 text-sm',
        md: 'h-11 px-5 text-sm',
        lg: 'h-12 px-7 text-[0.95rem]',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, ...props },
  ref,
) {
  return <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
