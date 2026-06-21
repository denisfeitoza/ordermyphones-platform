import type { TierDef } from '@/data/tiers';

// Literal class maps so Tailwind's JIT detects them (dynamic `tier-${n}` is not scanned).
type Tone = TierDef['tone'];

export const tierText: Record<Tone, string> = {
  '1': 'text-tier-1',
  '2': 'text-tier-2',
  '3': 'text-tier-3',
  '4': 'text-tier-4',
};

export const tierBg: Record<Tone, string> = {
  '1': 'bg-tier-1',
  '2': 'bg-tier-2',
  '3': 'bg-tier-3',
  '4': 'bg-tier-4',
};

/** Soft tinted chip: 10% fill + solid text. */
export const tierSoft: Record<Tone, string> = {
  '1': 'bg-tier-1/10 text-tier-1',
  '2': 'bg-tier-2/10 text-tier-2',
  '3': 'bg-tier-3/10 text-tier-3',
  '4': 'bg-tier-4/10 text-tier-4',
};

export const tierBorder: Record<Tone, string> = {
  '1': 'border-tier-1/40',
  '2': 'border-tier-2/40',
  '3': 'border-tier-3/40',
  '4': 'border-tier-4/40',
};
