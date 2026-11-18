import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SeriesService, slugToSense, targetFromLabel } from './series.service';

// ------------------------------------------------------------------
// Row factories (mirror Prisma ExerciseSeries shape)
// ------------------------------------------------------------------

function sensesRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'es-1',
    userId: 'u1',
    seriesType: 'SENSES',
    status: 'ACTIVE',
    remainingJson: [
      { key: 'شنوا', label: 'شنوا', done: false },
      { key: 'بویا', label: 'بویا', done: false },
      { key: 'چشایی', label: 'چشایی', done: false },
      { key: 'لمس', label: 'لمس', done: false },
    ],
    doneJson: [{ key: 'بینا', label: 'بینا', done: true, doneAt: '2026-11-01T00:00:00Z' }],
    lastActiveAt: new Date('2026-11-01T00:00:00Z'),
    ...overrides,
  };
}

function perspectiveRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'es-2',
    userId: 'u1',
    seriesType: 'PERSPECTIVE',
    status: 'ACTIVE',
    remainingJson: [
      { key: 'view-2', label: 'دیدگاه ۲', done: false },
      { key: 'view-3', label: 'دیدگاه ۳', done: false },
    ],
    doneJson: [{ key: 'view-1', label: 'دیدگاه ۱', done: true, doneAt: '2026-11-01T00:00:00Z' }],
    lastActiveAt: new Date('2026-11-01T00:00:00Z'),
    ...overrides,
  };
}

function morningPagesRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'es-3',
    userId: 'u1',
    seriesType: 'MORNING_PAGES',
    status: 'ACTIVE',
    remainingJson: [
      { key: 'day-3', label: 'روز ۳', done: false },
      { key: 'day-4', label: 'روز ۴', done: false },
    ],
    doneJson: [
      { key: 'day-1', label: 'روز ۱', done: true, doneAt: '2026-11-01T00:00:00Z' },
      { key: 'day-2', label: 'روز ۲', done: true, doneAt: '2026-11-02T00:00:00Z' },
    ],
    lastActiveAt: new Date('2026-11-02T00:00:00Z'),
    ...overrides,
  };
}

function wordGoalRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'es-4',
    userId: 'u1',
    seriesType: 'WORD_GOAL',
    status: 'ACTIVE',
    remainingJson: [{ key: 'words', label: 'هدف: 1000 کلمه', done: false }],
    doneJson: [] as Array<Record<string, unknown>>,
    lastActiveAt: new Date('2026-11-01T00:00:00Z'),
    ...overrides,
  };
}

describe('SeriesService', () => {
  let service: SeriesService;
  let prisma: {
    exerciseSeries: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      exerciseSeries: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    // Constructor param is typed `any` (no DI token) so we instantiate directly.
    service = new SeriesService(prisma);
  });

  // ----------------------------------------------------------------
  // list()
  // ----------------------------------------------------------------
  describe('list', () => {
    it('returns empty array when no series exist and auto-inits SENSES + PERSPECTIVE', async () => {
      // One findMany: no rows; the two auto-init creates are appended to the list.
      prisma.exerciseSeries.findMany.mockResolvedValue([]);
      prisma.exerciseSeries.create
        .mockResolvedValueOnce(sensesRow({ id: 'es-a', remainingJson: [], doneJson: [] }))
        .mockResolvedValueOnce(perspectiveRow({ id: 'es-b', remainingJson: [], doneJson: [] }));

      const result = await service.list('u1');

      expect(prisma.exerciseSeries.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.exerciseSeries.create).toHaveBeenCalledTimes(2);
      expect(prisma.exerciseSeries.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
        data: expect.objectContaining({ userId: 'u1', seriesType: 'SENSES' }),
      }));
      expect(prisma.exerciseSeries.create).toHaveBeenNthCalledWith(2, expect.objectContaining({
        data: expect.objectContaining({ userId: 'u1', seriesType: 'PERSPECTIVE' }),
      }));
      expect(result).toHaveLength(2);
    });

    it('does not re-create SENSES when it already exists', async () => {
      prisma.exerciseSeries.findMany.mockResolvedValue([sensesRow()]);
      prisma.exerciseSeries.create.mockResolvedValue(perspectiveRow());

      await service.list('u1');

      expect(prisma.exerciseSeries.create).toHaveBeenCalledTimes(1); // PERSPECTIVE only
      expect(prisma.exerciseSeries.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ seriesType: 'PERSPECTIVE' }),
        }),
      );
    });

    it('maps each row to a SeriesDto with correct progressPct', async () => {
      prisma.exerciseSeries.findMany.mockResolvedValue([sensesRow()]);
      prisma.exerciseSeries.create.mockResolvedValue(perspectiveRow());

      const [dto] = await service.list('u1');

      expect(dto).toMatchObject({
        id: 'es-1',
        seriesType: 'SENSES',
        status: 'ACTIVE',
        total: 5,
        completed: 1,
        progressPct: 20,
        target: 5,
        current: 1,
      });
    });
  });

  // ----------------------------------------------------------------
  // start()
  // ----------------------------------------------------------------
  describe('start', () => {
    it('rejects SENSES with SERIES_AUTO_INIT_ONLY', async () => {
      await expect(service.start('u1', 'SENSES')).rejects.toThrow(
        new BadRequestException('SERIES_AUTO_INIT_ONLY'),
      );
    });

    it('rejects PERSPECTIVE with SERIES_AUTO_INIT_ONLY', async () => {
      await expect(service.start('u1', 'PERSPECTIVE')).rejects.toThrow(
        new BadRequestException('SERIES_AUTO_INIT_ONLY'),
      );
    });

    it('rejects unknown type with UNKNOWN_SERIES_TYPE', async () => {
      await expect(service.start('u1', 'FAKE_TYPE')).rejects.toThrow(
        new BadRequestException('UNKNOWN_SERIES_TYPE'),
      );
    });

    it('rejects duplicate active MORNING_PAGES with SERIES_ALREADY_ACTIVE', async () => {
      prisma.exerciseSeries.findFirst.mockResolvedValue(morningPagesRow());
      await expect(service.start('u1', 'MORNING_PAGES')).rejects.toThrow(
        new BadRequestException('SERIES_ALREADY_ACTIVE'),
      );
    });

    it('starts MORNING_PAGES with default target (7 days)', async () => {
      prisma.exerciseSeries.findFirst.mockResolvedValue(null);
      const created = morningPagesRow({
        remainingJson: Array.from({ length: 7 }, (_, i) => ({
          key: `day-${i + 1}`,
          label: `روز ${i + 1}`,
          done: false,
        })),
        doneJson: [],
      });
      prisma.exerciseSeries.create.mockResolvedValue(created);

      const result = await service.start('u1', 'MORNING_PAGES');

      expect(prisma.exerciseSeries.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ seriesType: 'MORNING_PAGES' }),
        }),
      );
      expect(result.total).toBe(7);
      expect(result.completed).toBe(0);
    });

    it('starts WORD_GOAL with custom target', async () => {
      prisma.exerciseSeries.findFirst.mockResolvedValue(null);
      const created = wordGoalRow({
        remainingJson: [{ key: 'words', label: 'هدف: 2500 کلمه', done: false }],
      });
      prisma.exerciseSeries.create.mockResolvedValue(created);

      const result = await service.start('u1', 'WORD_GOAL', { target: 2500 });

      expect(result.target).toBe(2500);
      expect(result.current).toBe(0);
      expect(result.progressPct).toBe(0);
    });
  });

  // ----------------------------------------------------------------
  // track()
  // ----------------------------------------------------------------
  describe('track', () => {
    it('no-ops when no ACTIVE series exists for the type', async () => {
      prisma.exerciseSeries.findFirst.mockResolvedValue(null);
      await expect(
        service.track('u1', 'SENSES', { slug: 'five-senses' }),
      ).resolves.toBeUndefined();
      expect(prisma.exerciseSeries.update).not.toHaveBeenCalled();
    });

    // SENSES — sequential: each five-senses submit marks the NEXT remaining sense.
    it('SENSES: advances five-senses slug (شنوا → done), keeps ACTIVE', async () => {
      // بینا is already done; remaining is شنوا/بویا/چشایی/لمس.
      // Sequential: the first remaining sense (شنوا) is marked done.
      prisma.exerciseSeries.findFirst.mockResolvedValue(sensesRow());
      prisma.exerciseSeries.update.mockResolvedValue({});

      await service.track('u1', 'SENSES', { slug: 'five-senses' });

      expect(prisma.exerciseSeries.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'es-1' },
          data: expect.objectContaining({
            remainingJson: [
              { key: 'بویا', label: 'بویا', done: false },
              { key: 'چشایی', label: 'چشایی', done: false },
              { key: 'لمس', label: 'لمس', done: false },
            ],
          }),
        }),
      );
    });

    it('SENSES: marks COMPLETED when the last remaining sense (لمس) is done', async () => {
      const lastRow = sensesRow({
        remainingJson: [{ key: 'لمس', label: 'لمس', done: false }],
        doneJson: [
          { key: 'بینا', label: 'بینا', done: true, doneAt: '2026-11-01T00:00:00Z' },
          { key: 'شنوا', label: 'شنوا', done: true, doneAt: '2026-11-02T00:00:00Z' },
          { key: 'بویا', label: 'بویا', done: true, doneAt: '2026-11-03T00:00:00Z' },
          { key: 'چشایی', label: 'چشایی', done: true, doneAt: '2026-11-04T00:00:00Z' },
        ],
      });
      prisma.exerciseSeries.findFirst.mockResolvedValue(lastRow);
      prisma.exerciseSeries.update.mockResolvedValue({});

      await service.track('u1', 'SENSES', { slug: 'five-senses' });

      expect(prisma.exerciseSeries.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'es-1' },
          data: expect.objectContaining({
            remainingJson: [],
            status: 'COMPLETED',
          }),
        }),
      );
    });

    it('SENSES: no-ops when the series is already complete', async () => {
      prisma.exerciseSeries.findFirst.mockResolvedValue(
        sensesRow({ remainingJson: [], doneJson: [] }),
      );
      await service.track('u1', 'SENSES', { slug: 'five-senses' });
      expect(prisma.exerciseSeries.update).not.toHaveBeenCalled();
    });

    it('SENSES: no-ops for a non-senses slug', async () => {
      prisma.exerciseSeries.findFirst.mockResolvedValue(sensesRow());
      await service.track('u1', 'SENSES', { slug: 'perspectives' });
      expect(prisma.exerciseSeries.update).not.toHaveBeenCalled();
    });

    // PERSPECTIVE
    it('PERSPECTIVE: advances view-2 on perspectives slug, keeps ACTIVE', async () => {
      prisma.exerciseSeries.findFirst.mockResolvedValue(perspectiveRow());
      prisma.exerciseSeries.update.mockResolvedValue({});

      await service.track('u1', 'PERSPECTIVE', { slug: 'perspectives' });

      expect(prisma.exerciseSeries.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'es-2' },
          data: expect.objectContaining({
            remainingJson: [
              { key: 'view-3', label: 'دیدگاه ۳', done: false },
            ],
          }),
        }),
      );
    });

    it('PERSPECTIVE: marks COMPLETED when view-3 is the last one done', async () => {
      const lastRow = perspectiveRow({
        remainingJson: [{ key: 'view-3', label: 'دیدگاه ۳', done: false }],
        doneJson: [
          { key: 'view-1', label: 'دیدگاه ۱', done: true, doneAt: '2026-11-01T00:00:00Z' },
          { key: 'view-2', label: 'دیدگاه ۲', done: true, doneAt: '2026-11-02T00:00:00Z' },
        ],
      });
      prisma.exerciseSeries.findFirst.mockResolvedValue(lastRow);
      prisma.exerciseSeries.update.mockResolvedValue({});

      await service.track('u1', 'PERSPECTIVE', { slug: 'perspectives' });

      expect(prisma.exerciseSeries.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'es-2' },
          data: expect.objectContaining({
            remainingJson: [],
            status: 'COMPLETED',
          }),
        }),
      );
    });

    it('PERSPECTIVE: no-ops for a non-perspectives slug', async () => {
      prisma.exerciseSeries.findFirst.mockResolvedValue(perspectiveRow());
      await service.track('u1', 'PERSPECTIVE', { slug: 'five-senses' });
      expect(prisma.exerciseSeries.update).not.toHaveBeenCalled();
    });

    // MORNING_PAGES
    it('MORNING_PAGES: advances day-3 on morning-pages slug', async () => {
      prisma.exerciseSeries.findFirst.mockResolvedValue(morningPagesRow());
      prisma.exerciseSeries.update.mockResolvedValue({});

      await service.track('u1', 'MORNING_PAGES', { slug: 'morning-pages' });

      expect(prisma.exerciseSeries.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'es-3' },
          data: expect.objectContaining({
            remainingJson: [{ key: 'day-4', label: 'روز ۴', done: false }],
          }),
        }),
      );
    });

    it('MORNING_PAGES: marks COMPLETED on the last day', async () => {
      const lastRow = morningPagesRow({
        remainingJson: [{ key: 'day-3', label: 'روز ۳', done: false }],
        doneJson: [
          { key: 'day-1', label: 'روز ۱', done: true, doneAt: '2026-11-01T00:00:00Z' },
          { key: 'day-2', label: 'روز ۲', done: true, doneAt: '2026-11-02T00:00:00Z' },
        ],
      });
      // day-3 is last → completing it empties remaining.
      prisma.exerciseSeries.findFirst.mockResolvedValue(lastRow);
      prisma.exerciseSeries.update.mockResolvedValue({});

      await service.track('u1', 'MORNING_PAGES', { slug: 'morning-pages' });

      expect(prisma.exerciseSeries.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'es-3' },
          data: expect.objectContaining({
            remainingJson: [],
            status: 'COMPLETED',
          }),
        }),
      );
    });

    it('MORNING_PAGES: no-ops for a non-morning-pages slug', async () => {
      prisma.exerciseSeries.findFirst.mockResolvedValue(morningPagesRow());
      await service.track('u1', 'MORNING_PAGES', { slug: 'five-senses' });
      expect(prisma.exerciseSeries.update).not.toHaveBeenCalled();
    });

    // WORD_GOAL
    it('WORD_GOAL: accumulates wordCount into the _total sentinel', async () => {
      const row = wordGoalRow({
        doneJson: [
          { key: '_total', label: '', done: true, doneAt: '2026-11-01T00:00:00Z', words: 400 },
        ],
      });
      prisma.exerciseSeries.findFirst.mockResolvedValue(row);
      prisma.exerciseSeries.update.mockResolvedValue({});

      await service.track('u1', 'WORD_GOAL', { slug: 'five-senses', wordCount: 150 });

      expect(prisma.exerciseSeries.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'es-4' },
          data: expect.objectContaining({
            doneJson: expect.arrayContaining([
              expect.objectContaining({ key: '_total', words: 550 }),
            ]),
          }),
        }),
      );
    });

    it('WORD_GOAL: starts from 0 when no sentinel exists yet', async () => {
      const row = wordGoalRow({ doneJson: [] });
      prisma.exerciseSeries.findFirst.mockResolvedValue(row);
      prisma.exerciseSeries.update.mockResolvedValue({});

      await service.track('u1', 'WORD_GOAL', { slug: 'five-senses', wordCount: 200 });

      expect(prisma.exerciseSeries.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            doneJson: expect.arrayContaining([
              expect.objectContaining({ key: '_total', words: 200 }),
            ]),
          }),
        }),
      );
    });
  });

  // ----------------------------------------------------------------
  // suspend / resume
  // ----------------------------------------------------------------
  describe('suspend', () => {
    it('throws SERIES_NOT_FOUND for a missing row', async () => {
      prisma.exerciseSeries.findUnique.mockResolvedValue(null);
      await expect(service.suspend('u1', 'es-x')).rejects.toThrow(NotFoundException);
    });

    it('throws SERIES_FORBIDDEN for another user\'s row', async () => {
      prisma.exerciseSeries.findUnique.mockResolvedValue(sensesRow({ userId: 'other' }));
      await expect(service.suspend('u1', 'es-1')).rejects.toThrow(
        new BadRequestException('SERIES_FORBIDDEN'),
      );
    });

    it('throws SERIES_NOT_ACTIVE for a COMPLETED row', async () => {
      prisma.exerciseSeries.findUnique.mockResolvedValue(sensesRow({ status: 'COMPLETED' }));
      await expect(service.suspend('u1', 'es-1')).rejects.toThrow(
        new BadRequestException('SERIES_NOT_ACTIVE'),
      );
    });

    it('suspends an ACTIVE row', async () => {
      prisma.exerciseSeries.findUnique.mockResolvedValue(sensesRow());
      prisma.exerciseSeries.update.mockResolvedValue(sensesRow({ status: 'SUSPENDED' }));

      const result = await service.suspend('u1', 'es-1');

      expect(prisma.exerciseSeries.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'es-1' },
          data: { status: 'SUSPENDED' },
        }),
      );
      expect(result.status).toBe('SUSPENDED');
    });
  });

  describe('resume', () => {
    it('throws SERIES_NOT_SUSPENDED for an ACTIVE row', async () => {
      prisma.exerciseSeries.findUnique.mockResolvedValue(sensesRow());
      await expect(service.resume('u1', 'es-1')).rejects.toThrow(
        new BadRequestException('SERIES_NOT_SUSPENDED'),
      );
    });

    it('resumes a SUSPENDED row', async () => {
      prisma.exerciseSeries.findUnique.mockResolvedValue(sensesRow({ status: 'SUSPENDED' }));
      prisma.exerciseSeries.update.mockResolvedValue(sensesRow({ status: 'ACTIVE' }));

      const result = await service.resume('u1', 'es-1');

      expect(result.status).toBe('ACTIVE');
    });
  });
});

// ----------------------------------------------------------------
// Pure helper tests
// ----------------------------------------------------------------
describe('slugToSense', () => {
  it('maps five-senses to بینا', () => {
    expect(slugToSense('five-senses')).toBe('بینا');
  });

  it('returns null for unrelated slugs', () => {
    expect(slugToSense('perspectives')).toBeNull();
    expect(slugToSense('morning-pages')).toBeNull();
    expect(slugToSense('')).toBeNull();
  });
});

describe('targetFromLabel', () => {
  it('extracts the numeric target from a WORD_GOAL label', () => {
    expect(targetFromLabel('هدف: 1000 کلمه')).toBe(1000);
    expect(targetFromLabel('هدف: 2500 کلمه · تاکنون: 120')).toBe(2500);
  });

  it('returns 0 for a label without a target', () => {
    expect(targetFromLabel('')).toBe(0);
    expect(targetFromLabel('foo bar')).toBe(0);
  });
});
