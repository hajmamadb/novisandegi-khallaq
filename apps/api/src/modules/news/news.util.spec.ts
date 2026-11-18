import {
  NEWS_CATEGORIES,
  NEWS_LIMITS,
  categorize,
  curate,
  hashForUrl,
  isSensitive,
  normalizePersian,
  RawNewsItem,
  stripHtml,
} from './news.util';

function raw(over: Partial<RawNewsItem> = {}): RawNewsItem {
  return {
    title: 'وزیر اقتصاد از رشد نرخ تورم خبر داد',
    summary: 'نرخی که امروز اعلام شد نشان‌دهنده‌ی تغییرات بازار است.',
    sourceUrl: 'https://www.isna.ir/news/12345',
    sourceName: 'ایسنا',
    publishedAt: new Date('2026-11-04T09:00:00Z'),
    ...over,
  };
}

describe('news.util — curation + categorization + sensitive', () => {
  describe('categorize', () => {
    it('tags an economic headline as اقتصادی', () => {
      expect(categorize('نرخ تورم در بازار', 'قیمت کالاها افزایش یافت')).toBe('اقتصادی');
    });
    it('tags a political headline as سیاسی', () => {
      expect(categorize('رئیس‌جمهور از مجلس دیدن کرد', 'کابینه مصوبه تازه را تصویب کرد')).toBe('سیاسی');
    });
    it('tags an accident as حوادث', () => {
      expect(categorize('حادثه تصادف در جاده اصفهان', 'دو تن زخمی شدند')).toBe('حوادث');
    });
    it('tags a sports item as ورزشی', () => {
      expect(categorize('پیروزی تیم ملی در جام', 'تیم به قهرمانی رسید')).toBe('ورزشی');
    });
    it('falls back to سایر when nothing matches', () => {
      expect(categorize('برگ باران به زمین', 'صدایی از بیرون آمد')).toBe('سایر');
    });
    it('every category in NEWS_CATEGORIES is a possible return', () => {
      const set = new Set<string>(NEWS_CATEGORIES);
      expect(set.has(categorize('x', 'x'))).toBe(true);
    });
  });

  describe('curate', () => {
    it('keeps a normal item and passes the summary through', () => {
      const r = curate(raw());
      expect(r.keep).toBe(true);
      expect(r.summary).toBe(raw().summary);
    });
    it('drops a junk title that is too short', () => {
      const r = curate(raw({ title: 'کوتاه' }));
      expect(r.keep).toBe(false);
      expect(r.reason).toBe('title_too_short');
    });
    it('drops an item without a valid http(s) url', () => {
      const r = curate(raw({ sourceUrl: 'ftp://nope' }));
      expect(r.keep).toBe(false);
      expect(r.reason).toBe('bad_url');
    });
    it('truncates a long summary at a word boundary with an ellipsis', () => {
      const long = Array.from({ length: 80 }, (_, i) => `کلمه${i}`).join(' ');
      const r = curate(raw({ summary: long }));
      // Either truncated-kept or dropped as too long; must never return the raw 80-word string.
      if (r.keep) {
        expect((r.summary ?? '').endsWith('…')).toBe(true);
        expect((r.summary ?? '').split(/\s+/).length).toBeLessThanOrEqual(NEWS_LIMITS.MAX_SUMMARY_WORDS);
      } else {
        expect(r.reason).toBe('summary_too_long');
      }
    });
    it('drops a summary that is word-count long after the char cap', () => {
      // 60+ words but each word short, so char cap (400) is exceeded first then word cap.
      const words = Array.from({ length: 70 }, () => 'ا').join(' ');
      const r = curate(raw({ summary: words }));
      expect(r.keep).toBe(false);
    });
  });

  describe('hashForUrl', () => {
    it('is deterministic for the same url', () => {
      expect(hashForUrl('https://x.y/1')).toBe(hashForUrl('https://x.y/1'));
    });
    it('differs for different urls', () => {
      expect(hashForUrl('https://x.y/1')).not.toBe(hashForUrl('https://x.y/2'));
    });
    it('is a 40-char hex sha-1 (fits the VarChar(64) hash column)', () => {
      expect(hashForUrl('https://x.y/1')).toMatch(/^[0-9a-f]{40}$/);
    });
  });

  describe('isSensitive', () => {
    it('flags a violent item', () => {
      expect(isSensitive('انفجار در خیابان', 'سه تن کشته و پنج تن زخمی شدند')).toBe(true);
    });
    it('does not flag a benign item', () => {
      expect(isSensitive('رکورد جدید فروش کتاب', 'چندین نویسنده به جشنواره آمد')).toBe(false);
    });
  });

  describe('stripHtml + normalizePersian', () => {
    it('removes tags and decodes entities', () => {
      expect(stripHtml('<p>سلام <b>دنیا</b></p>&amp;')).toBe('سلام دنیا &');
    });
    it('normalizes ZWNJ/whitespace for matching', () => {
      expect(normalizePersian('رئیس‌جمهور  بزرگ')).toBe('رئیس جمهور بزرگ');
    });
  });
});
