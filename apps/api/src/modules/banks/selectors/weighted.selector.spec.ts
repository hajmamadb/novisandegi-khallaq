// K.2 unit test: WeightedSelector (spec G.1 — Efraimidis-Spirakis).
//
// Tests:
//  (a) correct item shape + SelectionLog row with algorithm=WEIGHTED_RANDOM
//  (b) matchesFilters for OPENING_LINE (genre/mood/difficulty)
//  (c) matchesFilters for NEWS (category + maxAgeDays freshness)
//  (d) matchesFilters for REFERENCE_STORY (genre)
//  (e) relax-fallback: filters eliminate all → retry without filters
//  (f) 404 BANK_EMPTY when pool is empty
//
// The seeded RNG is deterministic per (userId, bankType, day), so we test
// invariants (shape, log row, filter exclusion) rather than a specific id.

import { BankType } from '@prisma/client';
import { WeightedSelector } from './selector.service';

describe('WeightedSelector', () => {
  let selector: WeightedSelector;
  let prisma: {
    openingLine: { findMany: jest.Mock; findUnique: jest.Mock };
    newsItem: { findMany: jest.Mock; findUnique: jest.Mock };
    referenceStory: { findMany: jest.Mock; findUnique: jest.Mock };
    selectionLog: { findMany: jest.Mock; create: jest.Mock };
  };
  const events = { logRaw: jest.fn() };

  const makePrisma = () => {
    const p = {
      openingLine: { findMany: jest.fn(), findUnique: jest.fn() },
      newsItem: { findMany: jest.fn(), findUnique: jest.fn() },
      referenceStory: { findMany: jest.fn(), findUnique: jest.fn() },
      selectionLog: { findMany: jest.fn(), create: jest.fn() },
    };
    // Default: no prior selections (empty recent + empty ever).
    p.selectionLog.findMany.mockResolvedValue([]);
    p.selectionLog.create.mockResolvedValue({ id: 'log-w1' });
    return p;
  };

  beforeEach(() => {
    prisma = makePrisma();
    events.logRaw = jest.fn();
    selector = new WeightedSelector(prisma as any, events as any);
  });

  // ── (a) basic draw: item shape + SelectionLog algorithm ──────────────

  it('draws an OPENING_LINE and logs with algorithm=WEIGHTED_RANDOM', async () => {
    const rows = [
      { id: 'ol1', genre: 'رمان', mood: 'غمگین', difficulty: 2, text: '...' },
      { id: 'ol2', genre: 'داستان کوتاه', mood: 'امیدوارکننده', difficulty: 1, text: '...' },
    ];
    prisma.openingLine.findMany.mockResolvedValue(rows);
    prisma.openingLine.findUnique.mockImplementation(
      ({ where }: { where: { id: string } }) =>
        Promise.resolve({ id: where.id, text: 'خط باز' }),
    );

    const out = await selector.select({
      userId: 'u1',
      bankType: BankType.OPENING_LINE,
    });

    expect(out.item).toBeDefined();
    expect(out.item.id).toMatch(/ol[12]/);
    expect(out.selectionLogId).toBe('log-w1');
    expect(prisma.selectionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'u1',
          bankType: BankType.OPENING_LINE,
          algorithm: 'WEIGHTED_RANDOM',
        }),
      }),
    );
    expect(events.logRaw).toHaveBeenCalledWith(
      'u1',
      'bank_item_selected',
      expect.objectContaining({ algorithm: 'WEIGHTED_RANDOM' }),
      expect.anything(),
    );
  });

  // ── (b) matchesFilters: OPENING_LINE genre/mood/difficulty ───────────

  it('filters OPENING_LINE by genre (only matching items are drawn)', async () => {
    const rows = [
      { id: 'ol-genre-a', genre: 'رمان', mood: 'غمگین', difficulty: 2 },
      { id: 'ol-genre-b', genre: 'شعر', mood: 'غمگین', difficulty: 2 },
      { id: 'ol-genre-c', genre: 'رمان', mood: 'خوش', difficulty: 2 },
    ];
    prisma.openingLine.findMany.mockResolvedValue(rows);
    prisma.openingLine.findUnique.mockImplementation(
      ({ where }: { where: { id: string } }) =>
        Promise.resolve({ id: where.id, text: 'x' }),
    );

    // Draw 20 times with genre=رمان. The seeded RNG is deterministic,
    // but since only ol-genre-a and ol-genre-c match, ol-genre-b must
    // never appear.
    const drawn = new Set<string>();
    for (let i = 0; i < 20; i++) {
      // Reset mocks each iteration so the seed advances (new day would
      // normally do this, but in the same test we just re-invoke).
      const out = await selector.select({
        userId: `u-${i}`,
        bankType: BankType.OPENING_LINE,
        filters: { genre: 'رمان' },
      });
      drawn.add(out.item.id as string);
    }
    expect(drawn.has('ol-genre-b')).toBe(false);
    // At least one matching item was drawn.
    expect(drawn.size).toBeGreaterThanOrEqual(1);
    // Only matching genre items appeared.
    for (const id of drawn) {
      expect(id).toMatch(/^ol-genre-[ac]$/);
    }
  });

  it('filters OPENING_LINE by mood', async () => {
    const rows = [
      { id: 'ol-mood-sad', genre: 'رمان', mood: 'غمگین', difficulty: 1 },
      { id: 'ol-mood-happy', genre: 'رمان', mood: 'خوشحال', difficulty: 1 },
    ];
    prisma.openingLine.findMany.mockResolvedValue(rows);
    prisma.openingLine.findUnique.mockImplementation(
      ({ where }: { where: { id: string } }) =>
        Promise.resolve({ id: where.id, text: 'x' }),
    );

    const drawn = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const out = await selector.select({
        userId: `u-${i}`,
        bankType: BankType.OPENING_LINE,
        filters: { mood: 'غمگین' },
      });
      drawn.add(out.item.id as string);
    }
    expect(drawn.has('ol-mood-happy')).toBe(false);
    expect(drawn.has('ol-mood-sad')).toBe(true);
  });

  it('filters OPENING_LINE by difficulty', async () => {
    const rows = [
      { id: 'ol-d1', genre: 'رمان', mood: 'غمگین', difficulty: 1 },
      { id: 'ol-d3', genre: 'رمان', mood: 'غمگین', difficulty: 3 },
    ];
    prisma.openingLine.findMany.mockResolvedValue(rows);
    prisma.openingLine.findUnique.mockImplementation(
      ({ where }: { where: { id: string } }) =>
        Promise.resolve({ id: where.id, text: 'x' }),
    );

    const drawn = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const out = await selector.select({
        userId: `u-${i}`,
        bankType: BankType.OPENING_LINE,
        filters: { difficulty: 3 },
      });
      drawn.add(out.item.id as string);
    }
    expect(drawn.has('ol-d1')).toBe(false);
    expect(drawn.has('ol-d3')).toBe(true);
  });

  // ── (c) matchesFilters: NEWS category + maxAgeDays ───────────────────

  it('filters NEWS by category', async () => {
    const rows = [
      { id: 'n-tech', category: 'فناوری', publishedAt: new Date().toISOString() },
      { id: 'n-sport', category: 'ورزش', publishedAt: new Date().toISOString() },
    ];
    prisma.newsItem.findMany.mockResolvedValue(rows);
    prisma.newsItem.findUnique.mockImplementation(
      ({ where }: { where: { id: string } }) =>
        Promise.resolve({ id: where.id, title: 'x' }),
    );

    const drawn = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const out = await selector.select({
        userId: `u-${i}`,
        bankType: BankType.NEWS,
        filters: { category: 'فناوری' },
      });
      drawn.add(out.item.id as string);
    }
    expect(drawn.has('n-sport')).toBe(false);
    expect(drawn.has('n-tech')).toBe(true);
  });

  it('filters NEWS by maxAgeDays (freshness)', async () => {
    const now = Date.now();
    const fresh = new Date(now - 1 * 24 * 3600 * 1000).toISOString(); // 1 day old
    const stale = new Date(now - 60 * 24 * 3600 * 1000).toISOString(); // 60 days old
    const rows = [
      { id: 'n-fresh', category: 'اقتصاد', publishedAt: fresh },
      { id: 'n-stale', category: 'اقتصاد', publishedAt: stale },
    ];
    prisma.newsItem.findMany.mockResolvedValue(rows);
    prisma.newsItem.findUnique.mockImplementation(
      ({ where }: { where: { id: string } }) =>
        Promise.resolve({ id: where.id, title: 'x' }),
    );

    const drawn = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const out = await selector.select({
        userId: `u-${i}`,
        bankType: BankType.NEWS,
        filters: { maxAgeDays: 7 },
      });
      drawn.add(out.item.id as string);
    }
    expect(drawn.has('n-stale')).toBe(false);
    expect(drawn.has('n-fresh')).toBe(true);
  });

  // ── (d) matchesFilters: REFERENCE_STORY genre ────────────────────────

  it('filters REFERENCE_STORY by genre', async () => {
    const rows = [
      { id: 'rs-fiction', genre: 'داستان', summary: 'x' },
      { id: 'rs-essay', genre: 'تحلیلی', summary: 'x' },
    ];
    prisma.referenceStory.findMany.mockResolvedValue(rows);
    prisma.referenceStory.findUnique.mockImplementation(
      ({ where }: { where: { id: string } }) =>
        Promise.resolve({ id: where.id, title: 'x' }),
    );

    const drawn = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const out = await selector.select({
        userId: `u-${i}`,
        bankType: BankType.REFERENCE_STORY,
        filters: { genre: 'داستان' },
      });
      drawn.add(out.item.id as string);
    }
    expect(drawn.has('rs-essay')).toBe(false);
    expect(drawn.has('rs-fiction')).toBe(true);
  });

  // ── (e) relax-fallback: filters eliminate all → retry without ────────

  it('relaxes filters when they eliminate all candidates', async () => {
    // Only one item, genre=شعر. Filter requests genre=رمان → no match →
    // relax → draw from the unfiltered pool.
    const rows = [{ id: 'ol-1', genre: 'شعر', mood: 'خوش', difficulty: 1 }];
    prisma.openingLine.findMany.mockResolvedValue(rows);
    prisma.openingLine.findUnique.mockImplementation(
      ({ where }: { where: { id: string } }) =>
        Promise.resolve({ id: where.id, text: 'x' }),
    );

    const out = await selector.select({
      userId: 'u1',
      bankType: BankType.OPENING_LINE,
      filters: { genre: 'رمان' },
    });
    // The item was drawn despite the filter mismatch (relax fallback).
    expect(out.item.id).toBe('ol-1');
  });

  // ── (f) 404 BANK_EMPTY ───────────────────────────────────────────────

  it('throws 404 BANK_EMPTY when the pool is empty', async () => {
    prisma.openingLine.findMany.mockResolvedValue([]);

    await expect(
      selector.select({ userId: 'u1', bankType: BankType.OPENING_LINE }),
    ).rejects.toThrow(/BANK_EMPTY/);
  });

  it('throws 404 BANK_EMPTY when filters eliminate all and pool is empty after relax', async () => {
    // Pool has items but excludeIds removes all of them.
    prisma.openingLine.findMany.mockResolvedValue([
      { id: 'ol-1', genre: 'رمان' },
    ]);

    await expect(
      selector.select({
        userId: 'u1',
        bankType: BankType.OPENING_LINE,
        filters: { genre: 'شعر' },
        excludeIds: ['ol-1'],
      }),
    ).rejects.toThrow(/BANK_EMPTY/);
  });
});
