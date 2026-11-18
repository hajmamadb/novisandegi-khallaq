import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { NewsFeedService } from './news.service';

// Only the pure parser is tested here — fetch/DB are covered by the worker +
// integration; parseRss is side-effect-free and the most likely place for a
// feed-format regression.

describe('NewsFeedService.parseRss', () => {
  let service: NewsFeedService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [NewsFeedService, { provide: PrismaService, useValue: {} }],
    }).compile();
    service = moduleRef.get(NewsFeedService);
  });

  const RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>ایسنا</title>
  <item>
    <title>وزیر اقتصاد نشست تازه‌ای برگزار کرد</title>
    <description>نرخ &amp; قیمت مورد بحث قرار گرفت.</description>
    <link>https://www.isna.ir/news/111</link>
    <pubDate>Wed, 04 Nov 2026 06:00:00 GMT</pubDate>
  </item>
  <item>
    <title>تصادف در جاده اصفهان</title>
    <description>دو تن زخمی شدند.</description>
    <link>https://www.isna.ir/news/222</link>
    <pubDate>Wed, 04 Nov 2026 05:00:00 GMT</pubDate>
  </item>
</channel></rss>`;

  it('parses RSS 2.0 items with title/desc/link/pubDate', () => {
    const items = service.parseRss(RSS, 'ایسنا');
    expect(items).toHaveLength(2);
    expect(items[0].title).toContain('وزیر اقتصاد');
    expect(items[0].summary).toContain('قیمت'); // entity decoded
    expect(items[0].sourceUrl).toBe('https://www.isna.ir/news/111');
    expect(items[0].sourceName).toBe('ایسنا');
    expect(items[0].publishedAt).toBeInstanceOf(Date);
    expect(items[1].title).toContain('تصادف');
  });

  const RDF = `<?xml version="1.0"?>
<rdf:RDF>
  <item>
    <title>رویداد فرهنگی تازه‌ای در موزه</title>
    <description>نمایشگاه کتاب آغاز شد.</description>
    <link>https://m.example/p/9</link>
    <pubDate>2026-11-04T04:00:00Z</pubDate>
  </item>
</rdf:RDF>`;

  it('parses RDF <item> blocks too', () => {
    const items = service.parseRss(RDF, 'تسنیم');
    expect(items).toHaveLength(1);
    expect(items[0].title).toContain('موزه');
    expect(items[0].sourceUrl).toBe('https://m.example/p/9');
  });

  const ATOM = `<?xml version="1.0"?>
<feed>
  <entry>
    <title>خبر ورزشی جدید</title>
    <summary>تیم قهرمان لیگ شد.</summary>
    <link rel="alternate" href="https://a.example/s/5"/>
    <published>2026-11-04T03:00:00Z</published>
  </entry>
</feed>`;

  it('parses Atom <entry> with href-based links', () => {
    const items = service.parseRss(ATOM, 'ایلنا');
    expect(items).toHaveLength(1);
    expect(items[0].sourceUrl).toBe('https://a.example/s/5');
    expect(items[0].summary).toContain('قهرمان');
  });

  it('unwraps CDATA-wrapped title/description (ILNA format)', () => {
    const cdata = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item>
    <title><![CDATA[زنجیرهٔ شکست‌های سران آمریکا از میدان به صندوق رأی رسید
]]></title>
    <description><![CDATA[<p>آمریکایی‌ها در انتخابات پیش‌رو رأی می‌دهند.</p>]]></description>
    <link>https://www.ilna.ir/fa/tiny/news-1861801</link>
    <pubDate>Wed, 04 Nov 2026 02:00:00 GMT</pubDate>
  </item>
</channel></rss>`;
    const items = service.parseRss(cdata, 'ایلنا');
    expect(items).toHaveLength(1);
    // CDATA markers must not leak into the parsed text.
    expect(items[0].title).not.toContain('CDATA');
    expect(items[0].title).toContain('زنجیره');
    expect(items[0].title).toContain('صندوق رأی');
    expect(items[0].summary).not.toContain('CDATA');
    expect(items[0].summary).toContain('انتخابات');
    expect(items[0].sourceUrl).toBe('https://www.ilna.ir/fa/tiny/news-1861801');
  });

  it('returns [] for malformed/empty input', () => {
    expect(service.parseRss('', 'x')).toHaveLength(0);
    expect(service.parseRss('<not-rss/>', 'x')).toHaveLength(0);
  });

  it('skips items with no link or empty title', () => {
    const bad = `<rss><channel>
      <item><title>بدون لینک</title><description>x</description></item>
      <item><title></title><link>https://e.example/z</link><description>x</description></item>
    </channel></rss>`;
    expect(service.parseRss(bad, 'x')).toHaveLength(0);
  });
});
