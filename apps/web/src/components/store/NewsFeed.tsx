import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowUpRight, Rss } from 'lucide-react';
import { LogoMark } from './Logo';
import { useI18n } from '@/i18n';

interface NewsItem {
  title: string;
  link: string;
  source: string;
  publishedAt: string | null;
  summary: string;
}

const reveal = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
};

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

async function fetchNews(): Promise<NewsItem[]> {
  const base = import.meta.env.VITE_SUPABASE_URL;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!base) return [];
  const init: RequestInit = anon ? { headers: { Authorization: `Bearer ${anon}`, apikey: anon } } : {};
  const res = await fetch(`${base}/functions/v1/industry-news`, init);
  if (!res.ok) throw new Error(`news ${res.status}`);
  const json = (await res.json()) as { items?: NewsItem[] };
  return json.items ?? [];
}

/** "Industry News" — landing section (menu: News). Telecom headlines proxied +
 *  cached by the industry-news edge function (Fierce Wireless + TechRadar). The
 *  whole section self-hides until the feed returns items, so nothing broken or
 *  empty ever ships — it lights up the moment the edge function is live. */
export function NewsFeed() {
  const { t } = useI18n();
  const { data } = useQuery({
    queryKey: ['industry-news'],
    queryFn: fetchNews,
    staleTime: 20 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
  });

  const items = data ?? [];
  if (items.length === 0) return null;

  return (
    <section id="news" className="scroll-mt-24 border-t border-border bg-muted/30">
      <div className="container py-16 md:py-24">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
          variants={reveal}
          className="flex flex-wrap items-end justify-between gap-4"
        >
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-brand">
              <LogoMark className="h-4 w-4" />
              {t('Industry News')}
            </span>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-balance md:text-4xl">
              {t('The mobile market, as it moves')}
            </h2>
            <p className="mt-3 text-muted-foreground text-pretty">
              {t('Telecom and device headlines from across the industry, refreshed throughout the day.')}
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground">
            <Rss className="h-3.5 w-3.5 text-brand" strokeWidth={2} />
            {t('Live feed')}
          </span>
        </motion.div>

        <motion.ul
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
          className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3"
        >
          {items.slice(0, 6).map((item) => (
            <motion.li key={item.link} variants={reveal}>
              <a
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex h-full flex-col rounded-2xl border border-border bg-card p-5 shadow-soft transition-colors hover:border-brand/40"
              >
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-brand">{item.source}</span>
                  <span className="font-mono tabular-nums">{fmtDate(item.publishedAt)}</span>
                </div>
                <h3 className="mt-2 font-display text-base font-semibold leading-snug tracking-tight text-balance">
                  {item.title}
                </h3>
                {item.summary && (
                  <p className="mt-2 flex-1 line-clamp-3 text-sm leading-relaxed text-muted-foreground text-pretty">
                    {item.summary}
                  </p>
                )}
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-foreground group-hover:gap-2">
                  {t('Read on')} {item.source}
                  <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" strokeWidth={2} />
                </span>
              </a>
            </motion.li>
          ))}
        </motion.ul>
      </div>
    </section>
  );
}
