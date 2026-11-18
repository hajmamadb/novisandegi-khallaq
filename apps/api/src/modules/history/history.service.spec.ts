import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { HistoryService } from './history.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('HistoryService', () => {
  let service: HistoryService;
  let prisma: {
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
    exerciseSession: { count: jest.Mock; findMany: jest.Mock; groupBy: jest.Mock };
    submission: { aggregate: jest.Mock; groupBy: jest.Mock };
    exerciseType: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(),
      $queryRaw: jest.fn(),
      exerciseSession: { count: jest.fn(), findMany: jest.fn(), groupBy: jest.fn() },
      submission: { aggregate: jest.fn(), groupBy: jest.fn() },
      exerciseType: { findMany: jest.fn() },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [HistoryService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(HistoryService);
  });

  describe('timeline', () => {
    it('returns paginated items and hasMore flag', async () => {
      // $transaction([count, findMany]) → [total, rows]
      prisma.$transaction.mockResolvedValue([
        45, // total
        [
          {
            id: 's1',
            status: 'SUBMITTED',
            startedAt: new Date(),
            endedAt: new Date(),
            exerciseType: { id: 'e1', slug: 'freewriting', title: 'Freewriting' },
            submission: {
              wordCount: 200,
              durationSeconds: 300,
              xpAwarded: 30,
              integrityResult: 'PASSED',
              submittedAt: new Date(),
            },
          },
        ],
      ]);

      const res = await service.timeline('u1', { page: 1, pageSize: 20 });
      expect(res.total).toBe(45);
      expect(res.hasMore).toBe(true);
      expect(res.items).toHaveLength(1);
      expect(res.items[0].wordCount).toBe(200);
      expect(res.items[0].integrityResult).toBe('PASSED');
    });

    it('maps sessions without a submission to null fields', async () => {
      prisma.$transaction.mockResolvedValue([
        1,
        [
          {
            id: 's2',
            status: 'IN_PROGRESS',
            startedAt: new Date(),
            endedAt: null,
            exerciseType: null,
            submission: null,
          },
        ],
      ]);

      const res = await service.timeline('u1', {});
      expect(res.items[0].wordCount).toBeNull();
      expect(res.items[0].xpAwarded).toBeNull();
      expect(res.items[0].submittedAt).toBeNull();
      expect(res.hasMore).toBe(false);
    });
  });

  describe('stats', () => {
    it('aggregates totals and averages', async () => {
      // Promise.all of 3 counts → [total, completed, abandoned]
      prisma.exerciseSession.count
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(8)
        .mockResolvedValueOnce(2);
      prisma.submission.aggregate.mockResolvedValue({
        _sum: { wordCount: 800, durationSeconds: 3600, xpAwarded: 240 },
      });
      prisma.exerciseSession.groupBy.mockResolvedValue([]);
      prisma.submission.groupBy.mockResolvedValue([
        { integrityResult: 'PASSED', _count: { _all: 8 } },
      ]);
      prisma.$queryRaw.mockResolvedValue([]);
      prisma.exerciseType.findMany.mockResolvedValue([]);

      const res = await service.stats('u1');
      expect(res.totalSessions).toBe(10);
      expect(res.completedSessions).toBe(8);
      expect(res.totalWords).toBe(800);
      expect(res.totalMinutes).toBe(60);
      expect(res.avgWordsPerSession).toBe(100);
      expect(res.totalXpAwarded).toBe(240);
      expect(res.byIntegrity).toEqual({ PASSED: 8 });
    });
  });

  describe('exportFormat', () => {
    it('accepts json and markdown', () => {
      expect(service.exportFormat('json')).toBe('json');
      expect(service.exportFormat('markdown')).toBe('markdown');
    });

    it('rejects anything else', () => {
      expect(() => service.exportFormat('csv')).toThrow(BadRequestException);
    });
  });
});
