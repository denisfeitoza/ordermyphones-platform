// supabase/functions/industry-news/index.ts
// Public telecom-news proxy for the landing page "Industry News" section.
//
// Browsers can't fetch third-party RSS directly (CORS). This function fetches a
// small set of telecom/mobile feeds server-side, normalizes them to JSON, merges
// and sorts by date, and returns the top headlines with permissive CORS. Results
// are cached per warm instance (~20 min) so we don't hammer the sources. Any feed
// that fails is skipped; if all fail we return an empty list and the section
// self-hides on the client.

// @ts-nocheck — Deno runtime
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const FEEDS = [
  { source: 'Fierce Network', url: 'https://www.fierce-network.com/rss/xml' },
  { source: 'Fierce Network', url: 'https://www.fiercewireless.com/rss/xml' },
  { source: 'TechRadar', url: 'https://www.techradar.com/rss/news/phone-and-communications/mobile-phones' },
];

const TTL_MS = 20 * 60 * 1000;
const MAX_ITEMS = 12;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

interface NewsItem {
  title: string;
  link: string;
  source: string;
  publishedAt: string | null;
  summary: string;
}

let cache: { at: number; items: NewsItem[] } = { at: 0, items: [] };

const strip = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

const tag = (block: string, name: string): string => {
  // Handles <name>..</name>, CDATA, and self-closing <link href="..."/> (Atom).
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  if (m) return strip(m[1]);
  const attr = block.match(new RegExp(`<${name}[^>]*href=["']([^"']+)["']`, 'i'));
  return attr ? attr[1].trim() : '';
};

function parseFeed(xml: string, source: string): NewsItem[] {
  const blocks = xml.match(/<(item|entry)[\s\S]*?<\/(item|entry)>/gi) ?? [];
  const out: NewsItem[] = [];
  for (const b of blocks) {
    const title = tag(b, 'title');
    const link = tag(b, 'link');
    if (!title || !link) continue;
    const dateRaw = tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated');
    const parsed = dateRaw ? new Date(dateRaw) : null;
    const summary = strip(tag(b, 'description') || tag(b, 'summary')).slice(0, 240);
    out.push({
      title,
      link,
      source,
      publishedAt: parsed && !isNaN(parsed.getTime()) ? parsed.toISOString() : null,
      summary,
    });
  }
  return out;
}

async function fetchOne(feed: { source: string; url: string }): Promise<NewsItem[]> {
  try {
    const res = await fetch(feed.url, {
      headers: { 'User-Agent': 'OrderMyPhones/1.0 (+https://ordermyphones.vercel.app)' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    return parseFeed(await res.text(), feed.source);
  } catch {
    return [];
  }
}

async function collect(): Promise<NewsItem[]> {
  const settled = await Promise.all(FEEDS.map(fetchOne));
  const seenLinks = new Set<string>();
  const merged: NewsItem[] = [];
  for (const item of settled.flat()) {
    if (seenLinks.has(item.link)) continue;
    seenLinks.add(item.link);
    merged.push(item);
  }
  merged.sort((a, b) => {
    const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    return tb - ta;
  });
  return merged.slice(0, MAX_ITEMS);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'GET') return new Response('method_not_allowed', { status: 405, headers: CORS });

  const now = Date.now();
  if (now - cache.at < TTL_MS && cache.items.length > 0) {
    return new Response(JSON.stringify({ items: cache.items, cached: true }), {
      headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'public, max-age=1200' },
    });
  }

  const items = await collect();
  if (items.length > 0) cache = { at: now, items };

  return new Response(JSON.stringify({ items, cached: false }), {
    headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'public, max-age=1200' },
  });
});
