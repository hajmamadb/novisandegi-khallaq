import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ClusterService } from './cluster.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('ClusterService', () => {
  let service: ClusterService;
  let prisma: {
    exerciseType: { findUnique: jest.Mock };
    word: { findMany: jest.Mock };
  };

  const clusteringExercise = {
    id: 'e1',
    slug: 'clustering-emotion',
    isActive: true,
    rubricJson: { check: 'clustering', minHubWords: 8 },
  };
  const nonClusteringExercise = {
    id: 'e2',
    slug: 'freewriting',
    isActive: true,
    rubricJson: { check: 'structure', beats: ['a'] },
  };

  const words = [
    { id: 'w1', text: 'موج', pos: 'اسم', frequency: 120, semanticTags: ['دریا', 'آب'], isActive: true },
    { id: 'w2', text: 'آرام', pos: 'صفت', frequency: 90, semanticTags: ['دریا'], isActive: true },
    { id: 'w3', text: 'نوردیدن', pos: 'فعل', frequency: 40, semanticTags: ['کوه'], isActive: true },
    { id: 'w4', text: 'سکوت', pos: 'اسم', frequency: 30, semanticTags: [], isActive: true },
  ];

  beforeEach(async () => {
    prisma = {
      exerciseType: { findUnique: jest.fn() },
      word: { findMany: jest.fn() },
    };
    prisma.exerciseType.findUnique.mockResolvedValue(clusteringExercise);
    prisma.word.findMany.mockResolvedValue(words);
    const module: TestingModule = await Test.createTestingModule({
      providers: [ClusterService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get<ClusterService>(ClusterService);
  });

  describe('forSlug', () => {
    it('returns isClustering payload with minHubWords from rubric', async () => {
      const res = await service.forSlug('clustering-emotion');
      expect(res.isClustering).toBe(true);
      expect(res.slug).toBe('clustering-emotion');
      expect(res.minHubWords).toBe(8);
      expect(res.hub).toBeNull();
      expect(res.candidates).toHaveLength(4);
    });

    it('cands are capped and ordered by frequency by default', async () => {
      const res = await service.forSlug('clustering-emotion');
      // No pos/tags → score all 0 → stable frequency-desc order preserved.
      expect(res.candidates.map((c) => c.text)).toEqual(['موج', 'آرام', 'نوردیدن', 'سکوت']);
    });

    it('ranks pos matches (+2) and shared tags (+1) to the front', async () => {
      const res = await service.forSlug('clustering-emotion', { pos: 'اسم', tags: 'دریا' });
      const order = res.candidates.map((c) => c.text);
      // موج:   pos match (+2) + tag دریا (+1) = 3
      // سکوت:  pos match (+2)                 = 2
      // آرام:  tag دریا (+1)                  = 1
      // نوردیدن: 0
      expect(order).toEqual(['موج', 'سکوت', 'آرام', 'نوردیدن']);
    });

    it('pos match alone outranks tag match alone', async () => {
      // Force distinct scores: tag filter matches w2 only; pos matches w1/w4.
      prisma.word.findMany.mockResolvedValue([
        { id: 'a', text: 'دریا', pos: 'اسم', frequency: 50, semanticTags: ['آب'], isActive: true },
        { id: 'b', text: 'آبی', pos: 'صفت', frequency: 40, semanticTags: ['آب'], isActive: true },
        { id: 'c', text: 'شادی', pos: 'اسم', frequency: 30, semanticTags: [], isActive: true },
      ]);
      const res = await service.forSlug('clustering-emotion', { pos: 'اسم', tags: 'آب' });
      const order = res.candidates.map((c) => c.text);
      // دریا: pos +2, tag +1 → 3 ; شادی: pos +2 → 2 ; آبی: tag +1 → 1
      expect(order).toEqual(['دریا', 'شادی', 'آبی']);
    });

    it('throws NOT_CLUSTERING_EXERCISE for non-clustering rubric', async () => {
      prisma.exerciseType.findUnique.mockResolvedValue(nonClusteringExercise);
      await expect(service.forSlug('freewriting')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws EXERCISE_NOT_FOUND for unknown slug', async () => {
      prisma.exerciseType.findUnique.mockResolvedValue(null);
      await expect(service.forSlug('ghost')).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
