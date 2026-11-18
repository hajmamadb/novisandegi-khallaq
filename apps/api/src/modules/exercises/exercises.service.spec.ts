import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ExercisesService } from './exercises.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('ExercisesService', () => {
  let service: ExercisesService;
  let prisma: { exerciseType: { findMany: jest.Mock; findUnique: jest.Mock } };

  const validExercise = {
    id: 'e1',
    slug: 'freewriting',
    title: 'نوشتن آزاد',
    category: 'BASIC',
    accessLevel: 'NOVICE',
    description: 'Write freely',
    durationSeconds: 300,
    wordTargetMin: 50,
    wordTargetMax: 500,
    bankSourceType: null,
    rubricJson: {},
    skillWeightsJson: {},
    baseXp: 30,
    difficultyBase: 1.0,
    isActive: true,
    displayOrder: 1,
    iconAsset: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = { exerciseType: { findMany: jest.fn(), findUnique: jest.fn() } };
    const module: TestingModule = await Test.createTestingModule({
      providers: [ExercisesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get<ExercisesService>(ExercisesService);
  });

  describe('list', () => {
    it('returns active exercises', async () => {
      prisma.exerciseType.findMany.mockResolvedValue([validExercise]);
      const res = await service.list({});
      expect(res).toHaveLength(1);
      expect(res[0].slug).toBe('freewriting');
      expect(prisma.exerciseType.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
    });

    it('filters by category', async () => {
      prisma.exerciseType.findMany.mockResolvedValue([]);
      await service.list({ category: 'STRUCTURE' });
      expect(prisma.exerciseType.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ category: 'STRUCTURE' }),
        }),
      );
    });
  });

  describe('getBySlug', () => {
    it('returns the exercise', async () => {
      prisma.exerciseType.findUnique.mockResolvedValue(validExercise);
      const res = await service.getBySlug('freewriting');
      expect(res.slug).toBe('freewriting');
    });

    it('throws 404 for unknown slug', async () => {
      prisma.exerciseType.findUnique.mockResolvedValue(null);
      await expect(service.getBySlug('ghost')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws 404 for inactive exercise', async () => {
      prisma.exerciseType.findUnique.mockResolvedValue({ ...validExercise, isActive: false });
      await expect(service.getBySlug('freewriting')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
