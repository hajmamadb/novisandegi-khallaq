import { Test, TestingModule } from '@nestjs/testing';
import { Submission } from '@prisma/client';
import { XpService, levelFromXp, skillLevelFromXp } from './xp.service';
import { PrismaService } from '../../prisma/prisma.service';

// ---------------------------------------------------------------------------
// Pure-function unit tests — no DB required.
// ---------------------------------------------------------------------------
describe('levelFromXp (pure)', () => {
  it('returns 1 for xp < 100', () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(99)).toBe(1);
  });

  it('returns 2 at xp = 100', () => {
    expect(levelFromXp(100)).toBe(2);
  });

  it('monotonically increases with xp', () => {
    const levels = [100, 300, 600, 1000, 2000, 5000, 10000, 50000]
      .map((x) => levelFromXp(x));
    for (let i = 1; i < levels.length; i += 1) {
      expect(levels[i]).toBeGreaterThanOrEqual(levels[i - 1]);
    }
  });

  it('never returns below 1', () => {
    expect(levelFromXp(-50)).toBe(1);
  });
});

describe('skillLevelFromXp (pure)', () => {
  it('returns 1 at 0 xp', () => {
    expect(skillLevelFromXp(0)).toBe(1);
  });

  it('returns 2 at 200 xp', () => {
    expect(skillLevelFromXp(200)).toBe(2);
  });

  it('returns 3 at 600 xp', () => {
    expect(skillLevelFromXp(600)).toBe(3);
  });

  it('returns 8 at 25000 xp', () => {
    expect(skillLevelFromXp(25000)).toBe(8);
  });

  it('caps at 8 for very large xp', () => {
    expect(skillLevelFromXp(999999)).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// XpService integration — mocked Prisma.
// ---------------------------------------------------------------------------
describe('XpService', () => {
  let service: XpService;
  let prisma: {
    exerciseSession: { findUnique: jest.Mock; count: jest.Mock };
    exerciseType: { findUniqueOrThrow: jest.Mock };
    eventLog: { count: jest.Mock };
    streakDay: { findFirst: jest.Mock };
    xPLedger: { aggregate: jest.Mock; create: jest.Mock };
    userStats: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
    userSkill: { upsert: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
  };

  const exercise = {
    id: 'ex-uuid',
    baseXp: 50,
    difficultyBase: 1.2,
    durationSeconds: 300,
    skillWeightsJson: { freewriting: 1.0 },
  };

  // DECISION: cast to Submission — the test only exercises the fields
  // awardForSubmission actually reads (id, userId, sessionId,
  // durationSeconds, integrityResult); the rest are irrelevant to the
  // multiplier math and would require a full DB row to construct.
  const submission = {
    id: 'sub-uuid',
    userId: 'u1',
    sessionId: 's1',
    durationSeconds: 300,
    integrityResult: 'PASSED' as const,
  } as unknown as Submission;

  const defaultStats = {
    userId: 'u1',
    xpTotal: 0,
    level: 1,
    wordsTotal: 0,
    activeDays: 0,
    currentStreak: 0,
    bestStreak: 0,
    freezesRemaining: 0,
    lastActiveDate: null,
    sessionsCount: 0,
  };

  beforeEach(async () => {
    prisma = {
      exerciseSession: { findUnique: jest.fn(), count: jest.fn() },
      exerciseType: { findUniqueOrThrow: jest.fn() },
      eventLog: { count: jest.fn() },
      streakDay: { findFirst: jest.fn() },
      xPLedger: { aggregate: jest.fn(), create: jest.fn() },
      userStats: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      userSkill: { upsert: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [XpService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get<XpService>(XpService);
  });

  it('awards base XP with no multipliers (first submission, PASSED)', async () => {
    prisma.exerciseSession.findUnique.mockResolvedValue({ exerciseTypeId: exercise.id });
    prisma.exerciseType.findUniqueOrThrow.mockResolvedValue(exercise);
    prisma.eventLog.count.mockResolvedValue(0); // no prior same-type in 7 days
    prisma.streakDay.findFirst.mockResolvedValue(null); // no yesterday active
    prisma.exerciseSession.count.mockResolvedValue(0); // first session
    prisma.xPLedger.aggregate.mockResolvedValue({ _sum: { finalXp: null } });
    prisma.xPLedger.create.mockResolvedValue({});
    prisma.userStats.findUnique.mockResolvedValue(defaultStats);
    prisma.userStats.update.mockResolvedValue({});
    prisma.userSkill.upsert.mockResolvedValue({});
    prisma.userSkill.findUnique.mockResolvedValue({ xpTotal: 50, id: 'sk1' });
    prisma.userSkill.update.mockResolvedValue({});

    const result = await service.awardForSubmission(submission, 100);

    // base=50, durationFactor=1.0, completionFactor=1.0, difficulty=1.2,
    // firstTime=1.5, novelty=1.0, quality=1.0, consistency=1.0, diminishing=1.0, cap=1.0
    // final = 50 * 1.0 * 1.0 * 1.2 * 1.5 = 90
    expect(result.base).toBe(50);
    expect(result.finalXp).toBe(90);
    expect(result.multipliers.firstTimeFactor).toBe(1.5);
    expect(result.multipliers.noveltyMultiplier).toBe(1.0);
    expect(result.multipliers.completionFactor).toBe(1.0);
    expect(result.xpTotal).toBe(90);
    expect(result.level).toBe(levelFromXp(90)); // still level 1
    expect(prisma.xPLedger.create).toHaveBeenCalled();
    expect(prisma.userStats.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ xpTotal: 90 }),
      }),
    );
  });

  it('applies novelty multiplier 0.7 when same exercise done in last 7 days', async () => {
    prisma.exerciseSession.findUnique.mockResolvedValue({ exerciseTypeId: exercise.id });
    prisma.exerciseType.findUniqueOrThrow.mockResolvedValue(exercise);
    // First call = 7-day novelty (3 prior → 0.7); second = 24h diminishing (0 prior → 1.0)
    prisma.eventLog.count
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(0);
    prisma.streakDay.findFirst.mockResolvedValue(null);
    prisma.exerciseSession.count.mockResolvedValue(3); // not first → 1.0
    prisma.xPLedger.aggregate.mockResolvedValue({ _sum: { finalXp: null } });
    prisma.xPLedger.create.mockResolvedValue({});
    prisma.userStats.findUnique.mockResolvedValue(defaultStats);
    prisma.userStats.update.mockResolvedValue({});
    prisma.userSkill.upsert.mockResolvedValue({});
    prisma.userSkill.findUnique.mockResolvedValue({ xpTotal: 42, id: 'sk1' });
    prisma.userSkill.update.mockResolvedValue({});

    const result = await service.awardForSubmission(submission, 100);
    // 50 * 1.0 * 1.0 * 1.2 * 1.0 * 0.7 = 42
    expect(result.multipliers.noveltyMultiplier).toBe(0.7);
    expect(result.finalXp).toBe(42);
  });

  it('applies WARNING completionFactor 0.8', async () => {
    const warningSubmission = { ...submission, integrityResult: 'WARNING' as const };
    prisma.exerciseSession.findUnique.mockResolvedValue({ exerciseTypeId: exercise.id });
    prisma.exerciseType.findUniqueOrThrow.mockResolvedValue(exercise);
    prisma.eventLog.count.mockResolvedValue(0);
    prisma.streakDay.findFirst.mockResolvedValue(null);
    prisma.exerciseSession.count.mockResolvedValue(0);
    prisma.xPLedger.aggregate.mockResolvedValue({ _sum: { finalXp: null } });
    prisma.xPLedger.create.mockResolvedValue({});
    prisma.userStats.findUnique.mockResolvedValue(defaultStats);
    prisma.userStats.update.mockResolvedValue({});
    prisma.userSkill.upsert.mockResolvedValue({});
    prisma.userSkill.findUnique.mockResolvedValue({ xpTotal: 36, id: 'sk1' });
    prisma.userSkill.update.mockResolvedValue({});

    const result = await service.awardForSubmission(warningSubmission, 100);
    expect(result.multipliers.completionFactor).toBe(0.8);
    // 50 * 1.0 * 0.8 * 1.2 * 1.5 = 72
    expect(result.finalXp).toBe(72);
  });

  it('applies consistencyBonus 1.1 when yesterday was ACTIVE', async () => {
    prisma.exerciseSession.findUnique.mockResolvedValue({ exerciseTypeId: exercise.id });
    prisma.exerciseType.findUniqueOrThrow.mockResolvedValue(exercise);
    prisma.eventLog.count.mockResolvedValue(0);
    prisma.streakDay.findFirst.mockResolvedValue({ id: 'sd1' }); // yesterday ACTIVE
    prisma.exerciseSession.count.mockResolvedValue(0);
    prisma.xPLedger.aggregate.mockResolvedValue({ _sum: { finalXp: null } });
    prisma.xPLedger.create.mockResolvedValue({});
    prisma.userStats.findUnique.mockResolvedValue(defaultStats);
    prisma.userStats.update.mockResolvedValue({});
    prisma.userSkill.upsert.mockResolvedValue({});
    prisma.userSkill.findUnique.mockResolvedValue({ xpTotal: 54, id: 'sk1' });
    prisma.userSkill.update.mockResolvedValue({});

    const result = await service.awardForSubmission(submission, 100);
    expect(result.multipliers.consistencyBonus).toBe(1.1);
    // 50 * 1.0 * 1.0 * 1.2 * 1.5 * 1.1 = 99
    expect(result.finalXp).toBe(99);
  });

  it('applies diminishing factor for repeated submissions in last 24 h', async () => {
    prisma.exerciseSession.findUnique.mockResolvedValue({ exerciseTypeId: exercise.id });
    prisma.exerciseType.findUniqueOrThrow.mockResolvedValue(exercise);
    // First count call = 7-day novelty (0), second = 24h diminishing (2 prior)
    prisma.eventLog.count
      .mockResolvedValueOnce(0)   // novelty: none in 7 days
      .mockResolvedValueOnce(2);  // diminishing: 2 prior in 24h
    prisma.streakDay.findFirst.mockResolvedValue(null);
    prisma.exerciseSession.count.mockResolvedValue(0);
    prisma.xPLedger.aggregate.mockResolvedValue({ _sum: { finalXp: null } });
    prisma.xPLedger.create.mockResolvedValue({});
    prisma.userStats.findUnique.mockResolvedValue(defaultStats);
    prisma.userStats.update.mockResolvedValue({});
    prisma.userSkill.upsert.mockResolvedValue({});
    prisma.userSkill.findUnique.mockResolvedValue({ xpTotal: 30, id: 'sk1' });
    prisma.userSkill.update.mockResolvedValue({});

    const result = await service.awardForSubmission(submission, 100);
    // diminishing = 1 / (1 + 0.3 * (2 - 1)) = 1/1.3 ≈ 0.7692
    expect(result.multipliers.diminishing).toBeCloseTo(0.7692, 3);
    // 50 * 1.0 * 1.0 * 1.2 * 1.5 * 1.0 * 1.0 * 1.0 * 0.7692 ≈ 69.23 → 69
    expect(result.finalXp).toBe(69);
  });

  it('applies dailyCapFactor 0.5 when todaySum >= 600', async () => {
    prisma.exerciseSession.findUnique.mockResolvedValue({ exerciseTypeId: exercise.id });
    prisma.exerciseType.findUniqueOrThrow.mockResolvedValue(exercise);
    prisma.eventLog.count.mockResolvedValue(0);
    prisma.streakDay.findFirst.mockResolvedValue(null);
    prisma.exerciseSession.count.mockResolvedValue(0);
    prisma.xPLedger.aggregate.mockResolvedValue({ _sum: { finalXp: 650 } });
    prisma.xPLedger.create.mockResolvedValue({});
    prisma.userStats.findUnique.mockResolvedValue(defaultStats);
    prisma.userStats.update.mockResolvedValue({});
    prisma.userSkill.upsert.mockResolvedValue({});
    prisma.userSkill.findUnique.mockResolvedValue({ xpTotal: 22, id: 'sk1' });
    prisma.userSkill.update.mockResolvedValue({});

    const result = await service.awardForSubmission(submission, 100);
    expect(result.multipliers.dailyCapFactor).toBe(0.5);
    // 50 * 1.0 * 1.0 * 1.2 * 1.5 * 0.5 = 45
    expect(result.finalXp).toBe(45);
  });

  it('applies dailyCapFactor 0 when todaySum >= 1000', async () => {
    prisma.exerciseSession.findUnique.mockResolvedValue({ exerciseTypeId: exercise.id });
    prisma.exerciseType.findUniqueOrThrow.mockResolvedValue(exercise);
    prisma.eventLog.count.mockResolvedValue(0);
    prisma.streakDay.findFirst.mockResolvedValue(null);
    prisma.exerciseSession.count.mockResolvedValue(0);
    prisma.xPLedger.aggregate.mockResolvedValue({ _sum: { finalXp: 1200 } });
    prisma.xPLedger.create.mockResolvedValue({});
    prisma.userStats.findUnique.mockResolvedValue(defaultStats);
    prisma.userStats.update.mockResolvedValue({});
    prisma.userSkill.upsert.mockResolvedValue({});
    prisma.userSkill.findUnique.mockResolvedValue(null);

    const result = await service.awardForSubmission(submission, 100);
    expect(result.multipliers.dailyCapFactor).toBe(0);
    expect(result.finalXp).toBe(0);
  });

  it('creates UserStats when none exists', async () => {
    prisma.exerciseSession.findUnique.mockResolvedValue({ exerciseTypeId: exercise.id });
    prisma.exerciseType.findUniqueOrThrow.mockResolvedValue(exercise);
    prisma.eventLog.count.mockResolvedValue(0);
    prisma.streakDay.findFirst.mockResolvedValue(null);
    prisma.exerciseSession.count.mockResolvedValue(0);
    prisma.xPLedger.aggregate.mockResolvedValue({ _sum: { finalXp: null } });
    prisma.xPLedger.create.mockResolvedValue({});
    prisma.userStats.findUnique.mockResolvedValue(null); // no existing stats
    prisma.userStats.create.mockResolvedValue(defaultStats);
    prisma.userStats.update.mockResolvedValue({});
    prisma.userSkill.upsert.mockResolvedValue({});
    prisma.userSkill.findUnique.mockResolvedValue({ xpTotal: 90, id: 'sk1' });
    prisma.userSkill.update.mockResolvedValue({});

    await service.awardForSubmission(submission, 100);
    expect(prisma.userStats.create).toHaveBeenCalledWith({
      data: { userId: 'u1' },
    });
  });

  it('distributes per-skill XP via userSkill.upsert', async () => {
    prisma.exerciseSession.findUnique.mockResolvedValue({ exerciseTypeId: exercise.id });
    prisma.exerciseType.findUniqueOrThrow.mockResolvedValue(exercise);
    prisma.eventLog.count.mockResolvedValue(0);
    prisma.streakDay.findFirst.mockResolvedValue(null);
    prisma.exerciseSession.count.mockResolvedValue(0);
    prisma.xPLedger.aggregate.mockResolvedValue({ _sum: { finalXp: null } });
    prisma.xPLedger.create.mockResolvedValue({});
    prisma.userStats.findUnique.mockResolvedValue(defaultStats);
    prisma.userStats.update.mockResolvedValue({});
    prisma.userSkill.upsert.mockResolvedValue({});
    prisma.userSkill.findUnique.mockResolvedValue({ xpTotal: 90, id: 'sk1' });
    prisma.userSkill.update.mockResolvedValue({});

    await service.awardForSubmission(submission, 100);
    // finalXp = 90, weight 1.0 → skillXp = 90
    expect(prisma.userSkill.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_skillKey: { userId: 'u1', skillKey: 'freewriting' } },
      }),
    );
  });
});
