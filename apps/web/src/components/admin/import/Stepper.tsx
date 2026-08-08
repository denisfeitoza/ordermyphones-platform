import { Check } from 'lucide-react';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { WIZARD_STEPS, type WizardStepId } from './types';

export function Stepper({ current }: { current: WizardStepId }) {
  const { t } = useI18n();
  const currentIndex = WIZARD_STEPS.findIndex((s) => s.id === current);

  return (
    <ol className="flex items-center gap-1 overflow-x-auto sm:gap-2">
      {WIZARD_STEPS.map((step, i) => {
        const state = i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'upcoming';
        return (
          <li key={step.id} className="flex shrink-0 items-center gap-1 sm:gap-2">
            {i > 0 && <span className="h-px w-4 shrink-0 bg-border sm:w-8" aria-hidden />}
            <span
              className={cn(
                'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium sm:px-3 sm:py-1.5 sm:text-sm',
                state === 'current' && 'bg-foreground text-background',
                state === 'done' && 'bg-success/10 text-success',
                state === 'upcoming' && 'bg-muted text-muted-foreground',
              )}
            >
              {state === 'done' ? (
                <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
              ) : (
                <span className="tabular-nums">{i + 1}</span>
              )}
              {t(step.label)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
