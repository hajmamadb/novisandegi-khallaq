/**
 * Pure functions for the daily news pipeline (spec § news).
 *
 * DECISION: these are side-effect-free (no DB, no network, no clock) so they
 * can be unit-tested in isolation and reused by the worker + the daily endpoint.
 * Kept separate from NewsFeedService so the fetcher stays mockable.
 */

/** A normalized RSS/RDF item as pulled from a feed (before curation). */
export interface RawNewsItem {
  title: string;
  summary: string;
  sourceUrl: string;
  sourceName: string;
  publishedAt: Date;
}

/** Curation limits — "بسیار بلند" (very long) items are dropped. */
export const NEWS_LIMITS = {
  MAX_SUMMARY_CHARS: 400, // keep a short summary, never the full article
  MAX_SUMMARY_WORDS: 60,
  MIN_TITLE_CHARS: 10, // drop junk/truncated titles
} as const;

/**
 * The target categories (spec: سیاسی، اقتصادی، فرهنگی، حوادث و …). The
 * trailing "سایر" is the deterministic fallback so every item lands in a
 * named bucket.
 */
export const NEWS_CATEGORIES = [
  'سیاسی',
  'اقتصادی',
  'فرهنگی',
  'حوادث',
  'ورزشی',
  'سایر',
] as const;

export type NewsCategory = (typeof NEWS_CATEGORIES)[number];

/**
 * Persian keyword buckets — substring match against the normalized
 * title+summary. A category wins on the highest hit count; ties are broken by
 * NEWS_CATEGORIES order. This is a transparent, reproducible heuristic with
 * NO NLP dependency — the NLP service in this env is down by design
 * (nlp.service.ts DECISION), and a down service must not block the pipeline.
 * A Hazm classifier can replace this later without changing the data shape.
 */
const CATEGORY_KEYWORDS: Record<Exclude<NewsCategory, 'سایر'>, string[]> = {
  سیاسی: [
    'رئیس‌جمهور', 'رئیس جمهور', 'وزیر', 'مجلس', 'کابینه', 'دیپلماسی',
    'انتخابات', 'قانون', 'قوه قضاییه', 'حکومت', 'دولت', 'سیاست',
    'نایب‌رئیس', 'مذاکره', 'تحریم', 'پیام', 'نماینده', 'فرمان',
    'وزارتخانه', 'دیوان', 'تصویب', 'مصوبه',
  ],
  اقتصادی: [
    'اقتصاد', 'بازار', 'نقد', 'تورم', 'دولار', 'ارز', 'صندوق', 'بورس',
    'سهم', 'درآمد', 'بودجه', 'قیمت', 'تجارت', 'سرمایه', 'بهره‌وری',
    'تولید', 'صادرات', 'واردات', 'اقتصادی', 'کسب‌وکار', 'نقدینگی',
  ],
  فرهنگی: [
    'کتاب', 'نمایش', 'سینما', 'تئاتر', 'موزه', 'هنر', 'ادبیات', 'مطالعه',
    'کتابخانه', 'نویسنده', 'ترجمه', 'مستند', 'ادبی', 'فرهنگ', 'موزیک',
    'سنتی', 'جشنواره', 'نمایشگاه', 'نگارش', 'نوروز',
  ],
  حوادث: [
    'حادثه', 'تصادف', 'آتش‌سوزی', 'انفجار', 'کشته', 'زخمی', 'مرگ', 'غرق',
    'سرقت', 'زلزله', 'سیل', 'سقوط', 'برق‌گرفتگی', 'گرفتاری', 'اعتصاب',
  ],
  ورزشی: [
    'فوتبال', 'بازی', 'مسابقات', 'ورزش', 'باشگاه', 'تیم', 'رکورد',
    'مدال', 'جام', 'لیگ', 'قهرمانی', 'کشتی', 'بسکتبال', 'دوومیدانی',
    'قایق', 'جودو', 'کاراته',
  ],
};

/** Collapse Persian/ZWNJ whitespace + lowercase for stable substring matching. */
export function normalizePersian(s: string): string {
  return s
    .replace(/[\u200c\u0020\t\n\r]+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Classify title+summary into one of NEWS_CATEGORIES by keyword score.
 * Deterministic: highest hit count wins; ties resolved by category order;
 * 'سایر' when nothing matches.
 */
export function categorize(title: string, summary: string): NewsCategory {
  const text = normalizePersian(`${title} ${summary}`);
  let best: NewsCategory = 'سایر';
  let bestScore = 0;
  for (const cat of NEWS_CATEGORIES) {
    if (cat === 'سایر') continue;
    const words = CATEGORY_KEYWORDS[cat as Exclude<NewsCategory, 'سایر'>];
    let score = 0;
    for (const w of words) {
      if (text.includes(w)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = cat;
    }
  }
  return best;
}

/**
 * SHA-1 hex of the source URL, used as the dedup key (the `hash` column is
 * @unique VarChar(64); SHA-1 is 40 hex chars so it always fits).
 *
 * DECISION: dedup by sourceUrl — the same URL is the same article across
 * feeds. SHA-1 is only a stable unique key here, not a security hash.
 */
export function hashForUrl(sourceUrl: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHash } = require('crypto') as typeof import('crypto');
  return createHash('sha1').update(sourceUrl).digest('hex');
}

/**
 * Apply curation limits to a raw item. Returns `keep: false` + a reason when
 * the item must be dropped (very long / junk title / bad url).
 */
export function curate(item: RawNewsItem): {
  keep: boolean;
  reason?: string;
  summary?: string;
} {
  const title = (item.title ?? '').trim();
  const rawSummary = (item.summary ?? '').trim();

  if (!title || title.length < NEWS_LIMITS.MIN_TITLE_CHARS) {
    return { keep: false, reason: 'title_too_short' };
  }
  if (!item.sourceUrl || !/^https?:\/\//i.test(item.sourceUrl)) {
    return { keep: false, reason: 'bad_url' };
  }

  // Truncate to a short blurb (spec: "خلاصه‌ی کوتاه", never the full text).
  let summary = rawSummary;
  if (summary.length > NEWS_LIMITS.MAX_SUMMARY_CHARS) {
    summary = summary.slice(0, NEWS_LIMITS.MAX_SUMMARY_CHARS);
    const lastSpace = summary.lastIndexOf(' ');
    if (lastSpace > summary.length * 0.6) summary = summary.slice(0, lastSpace);
    summary = summary.replace(/\s+$/, '') + '…';
  }
  const wordCount = summary.split(/\s+/).filter(Boolean).length;
  if (wordCount > NEWS_LIMITS.MAX_SUMMARY_WORDS) {
    return { keep: false, reason: 'summary_too_long' };
  }

  return { keep: true, summary };
}

/** Strip HTML tags and decode a few common entities from an RSS description. */
export function stripHtml(html: string): string {
  return (html ?? '')
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6])\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s*\n\s*/g, ' ')
    .trim();
}

/**
 * Overly-violent / sensitive flag (spec: "بی‌رحمانه یا حساس" → isSensitive).
 *
 * DECISION: a flagged item is NOT dropped — it is stored with
 * `isSensitive: true` and excluded from the public community feed
 * (community.listNews filters `isSensitive: false`). An editor can still see
 * it in the approvals queue and publish it deliberately. A deterministic
 * keyword scan keeps this reproducible and NLP-free; it errs on the side of
 * flagging (false-positive sensitive beats false-negative violence).
 */
const SENSITIVE_KEYWORDS: string[] = [
  'آتش‌سوزی', 'انفجار', 'کشته', 'زخمی', 'مرگ', 'قتل', 'خون', 'جنازه',
  'مرگبار', 'فاجعه', 'ترور', 'شلیک', 'اتو', 'غواص', 'جسد', 'کشتار',
  'انتحار', 'خودکشی', 'سقوط', 'برق‌گرفتگی', 'گروگان', 'موشک', 'بمب',
];

/** True when title+summary matches a violence/sensitive keyword. */
export function isSensitive(title: string, summary: string): boolean {
  const text = normalizePersian(`${title} ${summary}`);
  return SENSITIVE_KEYWORDS.some((w) => text.includes(w));
}
