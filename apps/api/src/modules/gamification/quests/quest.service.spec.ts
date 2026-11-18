import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { QuestService } from './quest.service';
import { PrismaService } from '../../../prisma/prisma.service';

const TODAY_KEY = new Date().toISOString().slice(0, 10);

// Matches seed.ts "9. Quests".
const QUEST = {
  id: 'q-1',
  slug: 'daily.today-exercise',
  titleFa: 'تمرین امروز',
  type: 'daily',
  conditionJson: { exercise_submitted: 1 },
  rewardXp: 0,
  rewardInk: 5,
  isActive: true,
};

const ROW = {
  id: 'uq-1',
  userId: 'u1',
  questId: 'q-1',
  progress: 0,
  target: 1,
  completedAt: null as Date | null,
  dateKey: TODAY_KEY,
};

describe('QuestService', () => {
  let service: QuestService;
  let prisma: {
    quest: { findMany: jest.Mock; findUnique: jest.Mock };
    userQuest: { upsert: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    userSkill: { findMany: jest.Mock };
    inkTransaction: { create: jest.Mock; findFirst: jest.Mock };
    xPLedger: { create: jest.Mock };
    userStats: { findUnique: jest.Mock; upsert: jest.Mock };
    $transaction: jest.Mock;
  };
  let row: typeof ROW;

  beforeEach(async () => {
    row = { ...ROW };
    prisma = {
      quest: { findMany: jest.fn(), findUnique: jest.fn() },
      userQuest: { upsert: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      userSkill: { findMany: jest.fn() },
      inkTransaction: { create: jest.fn(), findFirst: jest.fn() },
      xPLedger: { create: jest.fn() },
      userStats: { findUnique: jest.fn(), upsert: jest.fn() },
      // Mocked client: run the interactive callback directly.
      $transaction: jest.fn(async (cb: (p: unknown) => Promise<void>) =>
        cb(prisma as unknown),
      ),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [QuestService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get<QuestService>(QuestService);
  });

  describe('today', () => {
    it('creates one UserQuest row per active quest (idempotent upsert)', async () => {
      prisma.quest.findMany.mockResolvedValue([QUEST]);
      const created = { ...row, quest: QUEST };
      prisma.userQuest.upsert.mockResolvedValue(created);

      const result = await service.today('u1');

      expect(prisma.quest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
      expect(prisma.userQuest.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.userQuest.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_questId_dateKey: { userId: 'u1', questId: 'q-1', dateKey: TODAY_KEY } },
          create: { userId: 'u1', questId: 'q-1', dateKey: TODAY_KEY, target: 1, progress: 0 },
        }),
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'uq-1',
        slug: 'daily.today-exercise',
        titleFa: 'تمرین امروز',
        rewardInk: 5,
        progress: 0,
        target: 1,
        claimed: false,
      });
    });

    it('reports claimed=true once completedAt is stamped', async () => {
      prisma.quest.findMany.mockResolvedValue([QUEST]);
      prisma.userQuest.upsert.mockResolvedValue({
        ...row,
        completedAt: new Date(),
        quest: QUEST,
      });

      const result = await service.today('u1');
      expect(result[0].claimed).toBe(true);
    });
  });

  describe('recordProgress', () => {
    it('no-ops for an unknown quest slug', async () => {
      prisma.quest.findUnique.mockResolvedValue(null);

      await expect(service.recordProgress('u1', 'daily.nonexistent')).resolves.toBeUndefined();
      expect(prisma.userQuest.upsert).not.toHaveBeenCalled();
    });

    it('no-ops for an inactive quest', async () => {
      prisma.quest.findUnique.mockResolvedValue({ ...QUEST, isActive: false });

      await expect(service.recordProgress('u1', 'daily.today-exercise')).resolves.toBeUndefined();
      expect(prisma.userQuest.upsert).not.toHaveBeenCalled();
    });

    it('creates a row with progress on first touch', async () => {
      prisma.quest.findUnique.mockResolvedValue(QUEST);
      prisma.userQuest.upsert.mockResolvedValue(row);
      prisma.userQuest.findUnique.mockResolvedValue(row);
      prisma.userQuest.update.mockResolvedValue(row);

      await service.recordProgress('u1', 'daily.today-exercise');

      expect(prisma.userQuest.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: { userId: 'u1', questId: 'q-1', dateKey: TODAY_KEY, target: 1, progress: 1 },
        }),
      );
    });

    it('clamps progress at target and stamps completedAt when target hit', async () => {
      prisma.quest.findUnique.mockResolvedValue(QUEST);
      prisma.userQuest.upsert.mockResolvedValue(row);
      prisma.userQuest.findUnique.mockResolvedValue({ ...row, progress: 3 });

      await service.recordProgress('u1', 'daily.today-exercise');

      expect(prisma.userQuest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'uq-1' },
          data: expect.objectContaining({ progress: 1, completedAt: expect.any(Date) }),
        }),
      );
    });

    it('does not set completedAt below target', async () => {
      prisma.quest.findUnique.mockResolvedValue({
        ...QUEST,
        conditionJson: { words_total: 100 },
      });
      prisma.userQuest.upsert.mockResolvedValue(row);
      prisma.userQuest.findUnique.mockResolvedValue({ ...row, target: 100, progress: 50 });

      await service.recordProgress('u1', 'daily.today-exercise', 50);

      expect(prisma.userQuest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ progress: 50, completedAt: null }),
        }),
      );
    });

    it('leaves an already-completed row untouched', async () => {
      prisma.quest.findUnique.mockResolvedValue(QUEST);
      prisma.userQuest.upsert.mockResolvedValue(row);
      prisma.userQuest.findUnique.mockResolvedValue({ ...row, completedAt: new Date() });

      await service.recordProgress('u1', 'daily.today-exercise');

      expect(prisma.userQuest.update).not.toHaveBeenCalled();
    });
  });

  describe('claim', () => {
    it('throws QUEST_NOT_FOUND for a missing row', async () => {
      prisma.userQuest.findUnique.mockResolvedValue(null);
      await expect(service.claim('u1', 'uq-x')).rejects.toThrow(NotFoundException);
      await expect(service.claim('u1', 'uq-x')).rejects.toThrow('QUEST_NOT_FOUND');
    });

    it('throws QUEST_NOT_FOUND when the row belongs to another user', async () => {
      prisma.userQuest.findUnique.mockResolvedValue({ ...row, userId: 'other' });
      await expect(service.claim('u1', 'uq-1')).rejects.toThrow('QUEST_NOT_FOUND');
    });

    it('throws QUEST_NOT_COMPLETE before completedAt is stamped', async () => {
      prisma.userQuest.findUnique.mockResolvedValue({ ...row, quest: QUEST });
      await expect(service.claim('u1', 'uq-1')).rejects.toThrow(
        new BadRequestException('QUEST_NOT_COMPLETE'),
      );
    });

    it('grants ink once; a second claim is rejected', async () => {
      const completed = { ...row, completedAt: new Date(), quest: QUEST };
      prisma.userQuest.findUnique.mockResolvedValue(completed);
      prisma.inkTransaction.create.mockResolvedValue({ id: 'ink-1' });
      // First claim: no marker yet. Second claim: marker exists.
      prisma.inkTransaction.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'ink-1' });

      const first = await service.claim('u1', 'uq-1');
      expect(first).toMatchObject({ id: 'uq-1', claimed: true });
      expect(prisma.inkTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { userId: 'u1', delta: 5, reason: 'quest_reward', sourceId: 'uq-1' },
        }),
      );

      await expect(service.claim('u1', 'uq-1')).rejects.toThrow(
        new BadRequestException('QUEST_ALREADY_CLAIMED'),
      );
    });

    it('awards XP via ledger + UserStats for an XP-granting quest', async () => {
      const xpQuest = { ...QUEST, rewardInk: 0, rewardXp: 20 };
      const completed = { ...row, completedAt: new Date(), quest: xpQuest };
      prisma.userQuest.findUnique.mockResolvedValue(completed);
      prisma.inkTransaction.findFirst.mockResolvedValue(null);
      prisma.xPLedger.create.mockResolvedValue({ id: 'xl-1' });
      prisma.userStats.findUnique.mockResolvedValue({ userId: 'u1', xpTotal: 100 });
      prisma.userStats.upsert.mockResolvedValue({ userId: 'u1', xpTotal: 120 });

      await service.claim('u1', 'uq-1');

      expect(prisma.inkTransaction.create).not.toHaveBeenCalled();
      expect(prisma.xPLedger.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'u1',
            sourceType: 'QUEST',
            sourceId: 'uq-1',
            base: 20,
            finalXp: 20,
          }),
        }),
      );
      expect(prisma.userStats.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ xpTotal: { increment: 20 } }),
        }),
      );
    });
  });

  describe('listSkills', () => {
    it('returns skill rows ordered by xpTotal desc', async () => {
      prisma.userSkill.findMany.mockResolvedValue([
        { skillKey: 'dialogue', xpTotal: 40, level: 2, sessionsCount: 3 },
        { skillKey: 'imagery', xpTotal: 10, level: 1, sessionsCount: 1 },
      ]);

      const result = await service.listSkills('u1');

      expect(prisma.userSkill.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { xpTotal: 'desc' } }),
      );
      expect(result).toEqual([
        { skillKey: 'dialogue', xpTotal: 40, level: 2, sessionsCount: 3 },
        { skillKey: 'imagery', xpTotal: 10, level: 1, sessionsCount: 1 },
      ]);
    });
  });
});
