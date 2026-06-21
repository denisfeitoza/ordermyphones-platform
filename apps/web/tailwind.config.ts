import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: '1rem', sm: '1.5rem', lg: '2rem' },
      screens: { sm: '640px', md: '768px', lg: '1024px', xl: '1280px', '2xl': '1440px' },
    },
    extend: {
      colors: {
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        muted: { DEFAULT: 'hsl(var(--muted) / <alpha-value>)', foreground: 'hsl(var(--muted-foreground) / <alpha-value>)' },
        card: { DEFAULT: 'hsl(var(--card) / <alpha-value>)', foreground: 'hsl(var(--card-foreground) / <alpha-value>)' },
        border: 'hsl(var(--border) / <alpha-value>)',
        input: 'hsl(var(--input) / <alpha-value>)',
        ring: 'hsl(var(--ring) / <alpha-value>)',
        primary: { DEFAULT: 'hsl(var(--primary) / <alpha-value>)', foreground: 'hsl(var(--primary-foreground) / <alpha-value>)' },
        secondary: { DEFAULT: 'hsl(var(--secondary) / <alpha-value>)', foreground: 'hsl(var(--secondary-foreground) / <alpha-value>)' },
        accent: { DEFAULT: 'hsl(var(--accent) / <alpha-value>)', foreground: 'hsl(var(--accent-foreground) / <alpha-value>)' },
        destructive: { DEFAULT: 'hsl(var(--destructive) / <alpha-value>)', foreground: 'hsl(var(--destructive-foreground) / <alpha-value>)' },
        success: 'hsl(var(--success) / <alpha-value>)',
        warning: 'hsl(var(--warning) / <alpha-value>)',
        // Brand identity (client-defined: blue → violet), used as controlled accents.
        brand: { DEFAULT: 'hsl(var(--brand) / <alpha-value>)', 2: 'hsl(var(--brand-2) / <alpha-value>)' },
        tier: {
          1: 'hsl(var(--tier-1) / <alpha-value>)',
          2: 'hsl(var(--tier-2) / <alpha-value>)',
          3: 'hsl(var(--tier-3) / <alpha-value>)',
          4: 'hsl(var(--tier-4) / <alpha-value>)',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['Geist', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Geist', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      letterSpacing: { tightest: '-0.04em' },
      boxShadow: {
        card: '0 1px 2px rgba(16,18,27,0.04), 0 10px 28px -14px rgba(16,18,27,0.14)',
        'card-hover': '0 2px 6px rgba(16,18,27,0.06), 0 28px 56px -24px rgba(16,18,27,0.26)',
        soft: '0 1px 2px rgba(16,18,27,0.05)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, hsl(var(--brand)) 0%, hsl(var(--brand-2)) 100%)',
        'hero-fade': 'linear-gradient(90deg, hsl(240 10% 4%) 0%, hsl(240 10% 4% / 0.55) 42%, transparent 78%)',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.16, 1, 0.3, 1)',
        'out-expo': 'cubic-bezier(0.19, 1, 0.22, 1)',
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
        'fade-up': { '0%': { opacity: '0', transform: 'translateY(16px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'scale-in': { '0%': { opacity: '0', transform: 'scale(0.96)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-12px)' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        marquee: { '0%': { transform: 'translateX(0)' }, '100%': { transform: 'translateX(-50%)' } },
        'ring-pulse': { '0%': { transform: 'scale(0.8)', opacity: '0.6' }, '100%': { transform: 'scale(2.4)', opacity: '0' } },
        'count-bump': { '0%,100%': { transform: 'translateY(0)' }, '30%': { transform: 'translateY(-3px)' } },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-up': 'fade-up 0.6s cubic-bezier(0.16,1,0.3,1) both',
        'fade-in': 'fade-in 0.5s ease both',
        'scale-in': 'scale-in 0.4s cubic-bezier(0.16,1,0.3,1) both',
        float: 'float 6s ease-in-out infinite',
        shimmer: 'shimmer 1.6s infinite',
        marquee: 'marquee 34s linear infinite',
        'ring-pulse': 'ring-pulse 1.8s cubic-bezier(0,0,0.2,1) infinite',
        'count-bump': 'count-bump 0.4s ease',
      },
    },
  },
  plugins: [animate],
};

export default config;
