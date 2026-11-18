import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  RawNewsItem,
  categorize,
  curate,
  hashForUrl,
  isSensitive,
  stripHtml,
} from './news.util';

/**
 * The feeds the daily pipeline pulls. Each agency publishes an RSS/Atom feed;
 * we read only the public feed URL (title + short description + link), never
 * scrape article bodies, in line with the agencies' terms of use.
 *
 * DECISION: feed URLs live here (not in .env) because the set of source
 * agencies is a product decision, not environment configuration. They can be
 * overridden by the `NEWS_FEEDS` env var (JSON array of {name,url}) if a feed
 * moves. A fetcher that can't reach a feed skips it — one dead feed must not
 * block the whole cycle.
 */
export interface FeedSource {
  name: string;
  url: string;
}

// DECISION: verified-live URLs (checked 2026-11-04 — each returns 200 +
// application/rss+xml with 30 items). ISNA/IRNA use a bare /rss path; ILNA
// serves from /feeds/. Tasnim is unreachable from some networks (TLS
// handshake fails server-side / geo-blocked) — kept in the list so a
// fetcher that CAN reach it still pulls it; the fetcher skips dead feeds
// gracefully so its failure never blocks the cycle.
const DEFAULT_FEEDS: FeedSource[] = [
  { name: 'ایسنا', url: 'https://www.isna.ir/rss' },
  { name: 'ایرنا', url: 'https://www.irna.ir/rss' },
  { name: 'ایلنا', url: 'https://www.ilna.ir/feeds/' },
  { name: 'تسنیم', url: 'https://www.tasnimnews.com/RSS/index.aspx' },
  { name: 'خبرآنلاین', url: 'https://www.khabaronline.ir/rss' },
];

const FETCH_TIMEOUT_MS = 60_000;
const USER_AGENT =
  'KarGah-NewsBot/1.0 (+https://kargah.ir; daily-news-pipeline; contact: hajmamad.b@gmail.com)';

@Injectable()
export class NewsFeedService {
  private readonly logger = new Logger(NewsFeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Feeds to fetch this cycle (env override, else DEFAULT_FEEDS). */
  private resolveFeeds(): FeedSource[] {
    try {
      const raw = process.env.NEWS_FEEDS;
      if (raw && raw.trim()) {
        const parsed = JSON.parse(raw) as FeedSource[];
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch {
      // Bad JSON in NEWS_FEEDS — fall back to defaults, not fatal.
    }
    return DEFAULT_FEEDS;
  }

  /**
   * One pipeline cycle: fetch every feed, curate + categorize each item,
   * upsert into news_items as PENDING (the admin approvals queue then gates
   * publication). Returns per-feed stats for logging/observability.
   *
   * Never throws for a single feed: a down agency is recorded and skipped.
   */
  async runFetchCycle(): Promise<
    Array<{ name: string; fetched: number; inserted: number; skipped: number }>
  > {
    const stats: Array<{
      name: string;
      fetched: number;
      inserted: number;
      skipped: number;
    }> = [];

    for (const feed of this.resolveFeeds()) {
      let raw: RawNewsItem[] = [];
      try {
        raw = await this.fetchFeed(feed);
      } catch (err) {
        this.logger.warn(
          `feed "${feed.name}" unreachable, skipping: ${(err as Error).message}`,
        );
        raw = [];
      }

      let inserted = 0;
      let skipped = 0;
      for (const item of raw) {
        const verdict = curate(item);
        if (!verdict.keep) {
          skipped += 1;
          continue;
        }
        const hash = hashForUrl(item.sourceUrl);
        const existing = await this.prisma.newsItem.findUnique({
          where: { hash },
          select: { id: true },
        });
        if (existing) {
          skipped += 1; // dedup: same URL already seen
          continue;
        }
        try {
          await this.prisma.newsItem.create({
            data: {
              title: item.title.trim(),
              summary: verdict.summary ?? '',
              sourceName: feed.name,
              sourceUrl: item.sourceUrl,
              publishedAt: item.publishedAt,
              category: categorize(item.title, item.summary),
              hash,
              status: 'PENDING', // editor approval gates publication
              isSensitive: isSensitive(item.title, item.summary),
            },
          });
          inserted += 1;
        } catch (err) {
          skipped += 1;
          this.logger.warn(
            `insert failed for ${item.sourceUrl}: ${(err as Error).message}`,
          );
        }
      }
      stats.push({ name: feed.name, fetched: raw.length, inserted, skipped });
      this.logger.log(
        `feed "${feed.name}": fetched=${raw.length} inserted=${inserted} skipped=${skipped}`,
      );
    }
    return stats;
  }

  /** Fetch + parse one feed into normalized raw items. */
  private async fetchFeed(feed: FeedSource): Promise<RawNewsItem[]> {
    const res = await fetch(feed.url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/xml, text/xml, */*' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    return this.parseRss(text, feed.name);
  }

  /**
   * Regex-based RSS/RDF/Atom parser (no XML lib in the locked stack).
   * Handles both RSS 2.0 `<item>` and RDF `<item>`/Atom `<entry>`.
   * Each item yields title, description (→ summary), link, pubDate.
   */
  parseRss(xml: string, sourceName: string): RawNewsItem[] {
    const items: RawNewsItem[] = [];
    // Split on <item> or <entry> (RSS 2.0 / Atom). Non-greedy to next closing tag.
    const blockRe = /<(?:item|entry)[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi;
    let m: RegExpExecArray | null;
    while ((m = blockRe.exec(xml)) !== null) {
      const block = m[1];
      const title = this.pickTag(block, 'title') ?? '';
      const desc =
        this.pickTag(block, 'description') ??
        this.pickTag(block, 'summary') ??
        this.pickTag(block, 'content') ??
        '';
      const link = this.pickTag(block, 'link') ?? this.pickLinkAttr(block);
      const pub =
        this.pickTag(block, 'pubDate') ??
        this.pickTag(block, 'published') ??
        this.pickTag(block, 'updated') ??
        '';
      if (!title.trim() || !link) continue;
      items.push({
        title: stripHtml(title),
        summary: stripHtml(desc),
        sourceUrl: link,
        sourceName,
        publishedAt: new Date(pub || Date.now()),
      });
    }
    return items;
  }

  /**
   * First <tag>…</tag> content (HTML entities stay; stripHtml cleans later).
   *
   * DECISION: some feeds (notably ILNA) wrap values in `<![CDATA[…]]>`. The
   * CDATA markers are NOT legal HTML, so stripHtml alone would leave literal
   * `<![CDATA[` / `]]>` debris in the text and corrupt curation. Unwrap them
   * here so downstream code only ever sees plain (possibly HTML) content.
   */
  private pickTag(block: string, tag: string): string | null {
    // Some feeds nest the value; take the innermost first occurrence.
    const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
    const m = re.exec(block);
    if (!m) return null;
    return m[1]
      .replace(/<!\[CDATA\[/gi, '')
      .replace(/\]\]>/g, '')
      .trim();
  }

  /**
   * Atom `<link href="…"/>` has no inner text — pull the href attribute.
   * Prefer rel="alternate" / no rel; fall back to the first link's href.
   */
  private pickLinkAttr(block: string): string | null {
    const re = /<link[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi;
    let m: RegExpExecArray | null;
    let fallback: string | null = null;
    while ((m = re.exec(block)) !== null) {
      const attrs = m[0];
      const rel = /rel\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
      if (!rel || rel === 'alternate') return m[1];
      fallback ??= m[1];
    }
    return fallback;
  }
}
