import { Test, TestingModule } from '@nestjs/testing';
import { StreakService } from './streak.service';
import { XpService } from './xp.service';
import { QuestService } from './quests/quest.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsService } from '../events/events.service';

const TODAY = new Date('2026-11-03T00:00:00.000Z');
const YESTERDAY = new Date('2026-11-02T00:00:00.000Z');

describe('StreakService', () => {
  let service: StreakService;
  let prisma: {
    streakDay: { findUnique: jest.Mock; findFirst: jest.Mock; create: jest.Mock };
    userStats: { update: jest.Mock; findMany: jest.Mock };
  };
  const events = { logRaw: jest.fn() };
  const xp = {
    getOrCreateStats: jest.fn().mockResolvedValue({
      userId: 'u1',
      currentStreak: 0,
      bestStreak: 0,
      freezesRemaining: 0,
    }),
  };
  const quests = { recordProgress: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    prisma = {
      streakDay: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
      userStats: { update: jest.fn(), findMany: jest.fn() },
    };
    events.logRaw = jest.fn();
    xp.getOrCreateStats = jest.fn().mockResolvedValue({
      userId: 'u1',
      currentStreak: 0,
      bestStreak: 0,
      freezesRemaining: 0,
    });
    quests.recordProgress = jest.fn().mockResolvedValue(undefined);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StreakService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventsService, useValue: events },
        { provide: XpService, useValue: xp },
        { provide: QuestService, useValue: quests },
      ],
    }).compile();
    service = module.get<StreakService>(StreakService);
  });

  describe('onSubmitted', () => {
    it('returns 0 when wordCount < 50', async () => {
      const result = await service.onSubmitted('u1', 30);
      expect(result).toBe(0);
      expect(prisma.streakDay.create).not.toHaveBeenCalled();
    });

    it('creates an ACTIVE StreakDay for today and sets currentStreak=1', async () => {
      prisma.streakDay.findUnique.mockResolvedValue(null); // no existing today
      prisma.streakDay.findFirst.mockResolvedValue(null);  // yesterday not active
      prisma.streakDay.create.mockResolvedValue({});
      prisma.userStats.update.mockResolvedValue({});

      const result = await service.onSubmitted('u1', 60);
      expect(result).toBe(1);
      expect(prisma.streakDay.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'u1', status: 'ACTIVE' }),
        }),
      );
      expect(prisma.userStats.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ currentStreak: 1 }),
        }),
      );
      expect(events.logRaw).toHaveBeenCalledWith(
        'u1',
        'streak_extended',
        expect.objectContaining({ currentStreak: 1 }),
      );
      // I.10: first qualifying submission of the day fires the today-exercise
      // quest (fire-and-forget; must not affect the return value).
      expect(quests.recordProgress).toHaveBeenCalledWith('u1', 'daily.today-exercise');
    });

    it('fires the today-exercise quest exactly once on the first qualifying day', async () => {
      prisma.streakDay.findUnique.mockResolvedValue(null);
      prisma.streakDay.findFirst.mockResolvedValue(null);
      prisma.streakDay.create.mockResolvedValue({});
      prisma.userStats.update.mockResolvedValue({});

      await service.onSubmitted('u1', 55);
      expect(quests.recordProgress).toHaveBeenCalledTimes(1);
      expect(quests.recordProgress).toHaveBeenCalledWith('u1', 'daily.today-exercise');
    });

    it('does not fire the today-exercise quest below the 50-word threshold', async () => {
      const result = await service.onSubmitted('u1', 49);
      expect(result).toBe(0);
      expect(quests.recordProgress).not.toHaveBeenCalled();
    });

    it('increments streak when yesterday was ACTIVE', async () => {
      xp.getOrCreateStats.mockResolvedValue({
        userId: 'u1',
        currentStreak: 4,
        bestStreak: 5,
        freezesRemaining: 0,
      });
      prisma.streakDay.findUnique.mockResolvedValue(null);
      prisma.streakDay.findFirst.mockResolvedValue({ id: 'sd-y' }); // yesterday ACTIVE
      prisma.streakDay.create.mockResolvedValue({});
      prisma.userStats.update.mockResolvedValue({});

      const result = await service.onSubmitted('u1', 60);
      expect(result).toBe(5);
      expect(prisma.userStats.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ currentStreak: 5, bestStreak: 5 }),
        }),
      );
    });

    it('does not double-count a second submission on the same day', async () => {
      xp.getOrCreateStats.mockResolvedValue({
        userId: 'u1',
        currentStreak: 3,
        bestStreak: 3,
        freezesRemaining: 0,
      });
      prisma.streakDay.findUnique.mockResolvedValue({ id: 'sd-today' });
      const result = await service.onSubmitted('u1', 60);
      expect(result).toBe(3);
      expect(prisma.streakDay.create).not.toHaveBeenCalled();
    });

    it('grants a freeze every 7th consecutive day (capped at 2)', async () => {
      xp.getOrCreateStats.mockResolvedValue({
        userId: 'u1',
        currentStreak: 6, // will become 7
        bestStreak: 6,
        freezesRemaining: 0,
      });
      prisma.streakDay.findUnique.mockResolvedValue(null);
      prisma.streakDay.findFirst.mockResolvedValue({ id: 'sd-y' });
      prisma.streakDay.create.mockResolvedValue({});
      prisma.userStats.update.mockResolvedValue({});

      const result = await service.onSubmitted('u1', 60);
      expect(result).toBe(7);
      expect(prisma.userStats.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ freezesRemaining: 1 }),
        }),
      );
    });

    it('caps freezesRemaining at 2', async () => {
      xp.getOrCreateStats.mockResolvedValue({
        userId: 'u1',
        currentStreak: 13, // will become 14 (not %7)
        bestStreak: 13,
        freezesRemaining: 2,
      });
      // Make currentStreak become 14 → 14 % 7 === 0 → would add 1 but capped
      prisma.streakDay.findUnique.mockResolvedValue(null);
      prisma.streakDay.findFirst.mockResolvedValue({ id: 'sd-y' });
      prisma.streakDay.create.mockResolvedValue({});
      prisma.userStats.update.mockResolvedValue({});

      const result = await service.onSubmitted('u1', 60);
      expect(result).toBe(14);
      expect(prisma.userStats.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ freezesRemaining: 2 }), // capped
        }),
      );
    });
  });

  describe('runMidnight', () => {
    it('does nothing when user had an ACTIVE yesterday', async () => {
      prisma.userStats.findMany.mockResolvedValue([{ userId: 'u1' }]);
      prisma.streakDay.findFirst.mockResolvedValue({ id: 'sd-y' }); // yesterday exists

      await service.runMidnight();
      expect(prisma.streakDay.create).not.toHaveBeenCalled();
    });

    it('consumes a freeze when no yesterday day and freezesRemaining > 0', async () => {
      prisma.userStats.findMany.mockResolvedValue([{ userId: 'u1' }]);
      prisma.streakDay.findFirst.mockResolvedValue(null); // no yesterday
      xp.getOrCreateStats.mockResolvedValue({
        userId: 'u1',
        currentStreak: 3,
        freezesRemaining: 1,
      });
      prisma.streakDay.create.mockResolvedValue({});
      prisma.userStats.update.mockResolvedValue({});

      await service.runMidnight();
      expect(prisma.streakDay.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'FREEZE' }),
        }),
      );
      expect(prisma.userStats.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ freezesRemaining: 0 }),
        }),
      );
      expect(events.logRaw).toHaveBeenCalledWith(
        'u1',
        'streak_freeze_used',
        expect.anything(),
      );
    });

    it('breaks the streak when no freeze available', async () => {
      prisma.userStats.findMany.mockResolvedValue([{ userId: 'u1' }]);
      prisma.streakDay.findFirst.mockResolvedValue(null); // no yesterday
      xp.getOrCreateStats.mockResolvedValue({
        userId: 'u1',
        currentStreak: 5,
        freezesRemaining: 0,
      });
      prisma.streakDay.create.mockResolvedValue({});
      prisma.userStats.update.mockResolvedValue({});

      await service.runMidnight();
      expect(prisma.streakDay.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'MISSED' }),
        }),
      );
      expect(prisma.userStats.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ currentStreak: 0 }),
        }),
      );
      expect(events.logRaw).toHaveBeenCalledWith(
        'u1',
        'streak_broken',
        expect.objectContaining({ previousStreak: 5 }),
      );
    });

    it('skips users with currentStreak = 0', async () => {
      prisma.userStats.findMany.mockResolvedValue([]);

      await service.runMidnight();
      expect(prisma.streakDay.create).not.toHaveBeenCalled();
    });
  });
});
