import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Globe2, Headset, Percent, ShieldCheck, Sparkles, Tag, Truck, Zap, type LucideIcon } from 'lucide-react';
import { getAppSetting, setAppSetting } from '@/data/adminConfig';

/**
 * Admin-configurable home merchandising, stored as one jsonb block in
 * app_settings['home_content'] (anon-readable, admin-writable). The public
 * storefront reads it live; the admin "Home & promos" tab edits it. Every block
 * has an `enabled` flag so a section can be turned off without losing its
 * content, and each renders nothing when disabled/empty.
 */

const HOME_CONTENT_KEY = 'home_content';

// The small, friendly icon vocabulary offered in the editor. Stored as a string
// key so the jsonb stays serializable; resolved to a component at render time.
export const HOME_ICONS: Record<string, LucideIcon> = {
  Truck,
  Tag,
  ShieldCheck,
  Zap,
  BadgeCheck,
  Globe2,
  Headset,
  Percent,
  Sparkles,
};
export type HomeIconKey = keyof typeof HOME_ICONS;
export const HOME_ICON_KEYS = Object.keys(HOME_ICONS) as HomeIconKey[];

export interface BenefitItem {
  icon: HomeIconKey;
  text: string;
}
export interface PromoCard {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  href: string;
}

export interface HomeContent {
  benefits: {
    enabled: boolean;
    items: BenefitItem[];
    ctaLabel: string;
    ctaHref: string;
  };
  promos: {
    enabled: boolean;
    title: string;
    cards: PromoCard[];
  };
  trending: {
    enabled: boolean;
    title: string;
    variantIds: string[];
  };
}

export const DEFAULT_HOME_CONTENT: HomeContent = {
  benefits: {
    enabled: true,
    items: [
      { icon: 'Truck', text: 'Free shipping on approved orders' },
      { icon: 'Tag', text: 'Exclusive pricing for your tier' },
      { icon: 'ShieldCheck', text: '90-day warranty on every device' },
    ],
    ctaLabel: 'Request access',
    ctaHref: '/request-access',
  },
  promos: {
    enabled: true,
    title: 'Deals & promotions',
    cards: [
      {
        id: 'promo-cpo',
        title: 'Save up to $500',
        subtitle: 'On select certified pre-owned iPhones, while stock lasts.',
        badge: 'Limited time',
        href: '/catalog?condition=cpo',
      },
      {
        id: 'promo-bulk',
        title: 'Better rates at volume',
        subtitle: 'Wholesale and distributor pricing on 50+ unit orders.',
        badge: 'Wholesale',
        href: '/catalog',
      },
    ],
  },
  trending: {
    enabled: false,
    title: 'Trending now',
    variantIds: [],
  },
};

/** Merge stored content over defaults so a partial/older jsonb never crashes a block. */
function normalize(raw: Partial<HomeContent> | null): HomeContent {
  const d = DEFAULT_HOME_CONTENT;
  return {
    benefits: { ...d.benefits, ...(raw?.benefits ?? {}) },
    promos: { ...d.promos, ...(raw?.promos ?? {}) },
    trending: { ...d.trending, ...(raw?.trending ?? {}) },
  };
}

export function useHomeContent() {
  return useQuery({
    queryKey: ['home-content'],
    queryFn: async () => normalize(await getAppSetting<Partial<HomeContent> | null>(HOME_CONTENT_KEY, null)),
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateHomeContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: HomeContent) => setAppSetting(HOME_CONTENT_KEY, content),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['home-content'] }),
  });
}
