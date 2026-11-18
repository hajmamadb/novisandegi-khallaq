import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { BadgeService, Condition } from './badges.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { EventsService } from '../../events/events.service';

// ---------------------------------------------------------------------------
// Helper: build a minimal BadgeRule-shaped object for tests.
// ---------------------------------------------------------------------------
function makeRule(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'rule-1',
    badgeId: 'badge-1',
    triggerEvent: 'streak_extended',
    verificationLevel: 'A_AUTOMATIC',
    verificationQueryJson: null,
    conditionDslJson: { type: 'threshold', field: 'current_streak', gte: 3 } as unknown as Record<string, unknown>,
    isActive: true,
    ...overrides,
    badge: { isActive: true, isHidden: false },
  } as any;
}

function makeEvent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'evt-1',
    userId: 'u1',
    eventName: 'streak_extended',
    eventPayloadJson: { currentStreak: 3 },
    serverTimestamp: new Date(),
    ...overrides,
  } as any;
}

// ---------------------------------------------------------------------------
// evaluateCondition — pure DSL tests (no DB)
// ---------------------------------------------------------------------------
describe('BadgeService.evaluateCondition (pure)', () => {
  let service: BadgeService;
  const ctx = { userId: 'u1', fields: { current_streak: 5, sessions_count: 10, xp_total: 500 }, rows: [] as Array<Record<string, unknown>> };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BadgeService,
        { provide: PrismaService, useValue: {} },
        { provide: EventsService, useValue: { logRaw: jest.fn() } },
      ],
    }).compile();
    service = module.get<BadgeService>(BadgeService);
    // Access the private method via bracket notation for unit testing.
  });

  function evalCond(node: Condition) {
    return (service as any).evaluateCondition(node, ctx);
  }

  it('threshold gte passes when value >= gte', async () => {
    expect(await evalCond({ type: 'threshold', field: 'current_streak', gte: 3 })).toBe(true);
  });

  it('threshold gte fails when value < gte', async () => {
    expect(await evalCond({ type: 'threshold', field: 'current_streak', gte: 10 })).toBe(false);
  });

  it('threshold lte passes when value <= lte', async () => {
    expect(await evalCond({ type: 'threshold', field: 'current_streak', lte: 5 })).toBe(true);
  });

  it('threshold eq passes when value === eq', async () => {
    expect(await evalCond({ type: 'threshold', field: 'current_streak', eq: 5 })).toBe(true);
  });

  it('threshold returns false for unknown field', async () => {
    expect(await evalCond({ type: 'threshold', field: 'nonexistent', gte: 1 })).toBe(false);
  });

  it('distinct_count counts unique values across rows', async () => {
    const c = { ...ctx, rows: [{ skill: 'A' }, { skill: 'B' }, { skill: 'A' }] };
    expect(await (service as any).evaluateCondition({ type: 'distinct_count', field: 'skill', gte: 2 }, c)).toBe(true);
    expect(await (service as any).evaluateCondition({ type: 'distinct_count', field: 'skill', gte: 3 }, c)).toBe(false);
  });

  it('sum adds numeric values across rows', async () => {
    const c = { ...ctx, rows: [{ xp: 10 }, { xp: 20 }, { xp: 30 }] };
    expect(await (service as any).evaluateCondition({ type: 'sum', field: 'xp', gte: 60 }, c)).toBe(true);
    expect(await (service as any).evaluateCondition({ type: 'sum', field: 'xp', gte: 61 }, c)).toBe(false);
  });

  it('and requires all children to pass', async () => {
    const node: Condition = {
      type: 'and',
      conditions: [
        { type: 'threshold', field: 'current_streak', gte: 3 },
        { type: 'threshold', field: 'sessions_count', gte: 10 },
      ],
    };
    expect(await evalCond(node)).toBe(true);

    const failNode: Condition = {
      type: 'and',
      conditions: [
        { type: 'threshold', field: 'current_streak', gte: 3 },
        { type: 'threshold', field: 'sessions_count', gte: 100 },
      ],
    };
    expect(await evalCond(failNode)).toBe(false);
  });

  it('or passes if any child passes', async () => {
    const node: Condition = {
      type: 'or',
      conditions: [
        { type: 'threshold', field: 'current_streak', gte: 100 },
        { type: 'threshold', field: 'sessions_count', gte: 10 },
      ],
    };
    expect(await evalCond(node)).toBe(true);
  });

  it('or returns false when no child passes', async () => {
    const node: Condition = {
      type: 'or',
      conditions: [
        { type: 'threshold', field: 'current_streak', gte: 100 },
        { type: 'threshold', field: 'sessions_count', gte: 100 },
      ],
    };
    expect(await evalCond(node)).toBe(false);
  });

  it('custom returns false in phase 1', async () => {
    expect(await evalCond({ type: 'custom', code: 'some_code' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// evaluateForEvent — mocked Prisma
// ---------------------------------------------------------------------------
describe('BadgeService.evaluateForEvent', () => {
  let service: BadgeService;
  let prisma: {
    eventLog: { findUnique: jest.Mock };
    badgeRule: { findMany: jest.Mock };
    userStats: { findUnique: jest.Mock };
    badge: { findUniqueOrThrow: jest.Mock; findUnique: jest.Mock };
    badgeAward: { findUnique: jest.Mock; create: jest.Mock };
    badgeProgress: { upsert: jest.Mock; updateMany: jest.Mock };
    $queryRaw: jest.Mock;
    $queryRawUnsafe: jest.Mock;
  };
  const events = { logRaw: jest.fn() };

  const badge = {
    id: 'badge-1',
    slug: 'streak-3',
    titleFa: '۳ روزه متوالی',
    descriptionFa: 'سه روز متوالی نوشتن',
    tier: 'BRONZE',
    isActive: true,
    isHidden: false,
  };

  beforeEach(async () => {
    prisma = {
      eventLog: { findUnique: jest.fn() },
      badgeRule: { findMany: jest.fn() },
      userStats: { findUnique: jest.fn() },
      badge: { findUniqueOrThrow: jest.fn(), findUnique: jest.fn() },
      badgeAward: { findUnique: jest.fn(), create: jest.fn() },
      badgeProgress: { upsert: jest.fn(), updateMany: jest.fn() },
      $queryRaw: jest.fn(),
      $queryRawUnsafe: jest.fn(),
    };
    events.logRaw = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BadgeService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventsService, useValue: events },
      ],
    }).compile();
    service = module.get<BadgeService>(BadgeService);
  });

  it('returns early when event not found', async () => {
    prisma.eventLog.findUnique.mockResolvedValue(null);
    await service.evaluateForEvent('ghost');
    expect(prisma.badgeRule.findMany).not.toHaveBeenCalled();
  });

  it('skips rules for inactive badges', async () => {
    prisma.eventLog.findUnique.mockResolvedValue(makeEvent());
    prisma.badgeRule.findMany.mockResolvedValue([
      makeRule({ badge: { isActive: false, isHidden: false } }),
    ]);
    await service.evaluateForEvent('evt-1');
    // No badge awarded because badge is inactive
    expect(prisma.badgeAward.create).not.toHaveBeenCalled();
  });

  it('awards badge when threshold condition passes', async () => {
    prisma.eventLog.findUnique.mockResolvedValue(makeEvent());
    prisma.badgeRule.findMany.mockResolvedValue([
      makeRule({
        conditionDslJson: { type: 'threshold', field: 'current_streak', gte: 3 },
      }),
    ]);
    prisma.userStats.findUnique.mockResolvedValue({
      currentStreak: 5, bestStreak: 5, sessionsCount: 10, wordsTotal: 100, xpTotal: 500, level: 2,
    });
    prisma.badge.findUniqueOrThrow.mockResolvedValue(badge);
    prisma.badgeAward.findUnique.mockResolvedValue(null); // not yet awarded
    prisma.badgeAward.create.mockResolvedValue({});
    prisma.badgeProgress.updateMany.mockResolvedValue({});

    await service.evaluateForEvent('evt-1');

    expect(prisma.badgeAward.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'u1',
          badgeId: 'badge-1',
          tier: 'BRONZE',
        }),
      }),
    );
    expect(events.logRaw).toHaveBeenCalledWith(
      'u1',
      'badge_earned',
      expect.objectContaining({ badgeId: 'badge-1', badgeSlug: 'streak-3' }),
    );
  });

  it('does not re-award an already-earned badge (idempotency)', async () => {
    prisma.eventLog.findUnique.mockResolvedValue(makeEvent());
    prisma.badgeRule.findMany.mockResolvedValue([
      makeRule({
        conditionDslJson: { type: 'threshold', field: 'current_streak', gte: 3 },
      }),
    ]);
    prisma.userStats.findUnique.mockResolvedValue({
      currentStreak: 5, bestStreak: 5, sessionsCount: 10, wordsTotal: 100, xpTotal: 500, level: 2,
    });
    prisma.badge.findUniqueOrThrow.mockResolvedValue(badge);
    prisma.badgeAward.findUnique.mockResolvedValue({ id: 'award-existing' }); // already awarded

    await service.evaluateForEvent('evt-1');

    expect(prisma.badgeAward.create).not.toHaveBeenCalled();
  });

  it('updates progress when condition not yet met', async () => {
    prisma.eventLog.findUnique.mockResolvedValue(makeEvent({ eventPayloadJson: { currentStreak: 1 } }));
    prisma.badgeRule.findMany.mockResolvedValue([
      makeRule({
        conditionDslJson: { type: 'threshold', field: 'current_streak', gte: 7 },
      }),
    ]);
    prisma.userStats.findUnique.mockResolvedValue({
      currentStreak: 1, bestStreak: 5, sessionsCount: 10, wordsTotal: 100, xpTotal: 500, level: 2,
    });
    prisma.badgeProgress.upsert.mockResolvedValue({});

    await service.evaluateForEvent('evt-1');

    expect(prisma.badgeProgress.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_badgeId: { userId: 'u1', badgeId: 'badge-1' } },
      }),
    );
    expect(prisma.badgeAward.create).not.toHaveBeenCalled();
  });

  it('runs verification query and logs failure when not verified', async () => {
    prisma.eventLog.findUnique.mockResolvedValue(makeEvent());
    prisma.badgeRule.findMany.mockResolvedValue([
      makeRule({
        conditionDslJson: { type: 'threshold', field: 'current_streak', gte: 3 },
        verificationQueryJson: { sql: 'SELECT COUNT(*) FROM streak_days WHERE user_id = $1 AND status = \'ACTIVE\'' },
      }),
    ]);
    prisma.userStats.findUnique.mockResolvedValue({
      currentStreak: 5, bestStreak: 5, sessionsCount: 10, wordsTotal: 100, xpTotal: 500, level: 2,
    });
    // Verification query returns 0 (not verified)
    prisma.$queryRaw.mockResolvedValue([{ count: '0' }]);

    await service.evaluateForEvent('evt-1');

    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(events.logRaw).toHaveBeenCalledWith(
      'u1',
      'badge_verification_failed',
      expect.anything(),
    );
    expect(prisma.badgeAward.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// listForUser — hidden badge masking
// ---------------------------------------------------------------------------
describe('BadgeService.listForUser', () => {
  let service: BadgeService;
  let prisma: {
    badge: { findMany: jest.Mock };
    badgeAward: { findMany: jest.Mock };
    badgeProgress: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      badge: { findMany: jest.fn() },
      badgeAward: { findMany: jest.fn() },
      badgeProgress: { findMany: jest.fn() },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BadgeService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventsService, useValue: { logRaw: jest.fn() } },
      ],
    }).compile();
    service = module.get<BadgeService>(BadgeService);
  });

  it('masks hidden badge title until earned', async () => {
    prisma.badge.findMany.mockResolvedValue([
      { id: 'b1', slug: 'secret', family: 'F1', tier: 'GOLD', titleFa: 'مخفی', descriptionFa: 'توضیح', iconAsset: null, isHidden: true, isActive: true, displayOrder: 1 },
    ]);
    prisma.badgeAward.findMany.mockResolvedValue([]);
    prisma.badgeProgress.findMany.mockResolvedValue([]);

    const result = await service.listForUser('u1');
    expect(result[0].titleFa).toBe('???');
    expect(result[0].descriptionFa).toBe('...');
    expect(result[0].earned).toBe(false);
  });

  it('shows hidden badge title when earned', async () => {
    prisma.badge.findMany.mockResolvedValue([
      { id: 'b1', slug: 'secret', family: 'F1', tier: 'GOLD', titleFa: 'مخفی', descriptionFa: 'توضیح', iconAsset: null, isHidden: true, isActive: true, displayOrder: 1 },
    ]);
    prisma.badgeAward.findMany.mockResolvedValue([
      { badgeId: 'b1', tier: 'GOLD', awardedAt: new Date(), narrativeFa: 'تبریک', verifiedAt: null },
    ]);
    prisma.badgeProgress.findMany.mockResolvedValue([]);

    const result = await service.listForUser('u1');
    expect(result[0].titleFa).toBe('مخفی');
    expect(result[0].earned).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// verifyAward
// ---------------------------------------------------------------------------
describe('BadgeService.verifyAward', () => {
  let service: BadgeService;
  let prisma: {
    badgeAward: { findUnique: jest.Mock; update: jest.Mock };
  };
  const events = { logRaw: jest.fn() };

  beforeEach(async () => {
    prisma = { badgeAward: { findUnique: jest.fn(), update: jest.fn() } };
    events.logRaw = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BadgeService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventsService, useValue: events },
      ],
    }).compile();
    service = module.get<BadgeService>(BadgeService);
  });

  it('throws 404 for unknown award', async () => {
    prisma.badgeAward.findUnique.mockResolvedValue(null);
    await expect(service.verifyAward('ghost', 'verifier-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('sets verifiedAt and verifiedBy, logs badge_verified', async () => {
    prisma.badgeAward.findUnique.mockResolvedValue({ id: 'aw1', userId: 'u1' });
    prisma.badgeAward.update.mockResolvedValue({ id: 'aw1', verifiedAt: new Date(), verifiedBy: 'verifier-1' });

    const result = await service.verifyAward('aw1', 'verifier-1');
    expect(result.verifiedBy).toBe('verifier-1');
    expect(events.logRaw).toHaveBeenCalledWith(
      'u1',
      'badge_verified',
      expect.objectContaining({ awardId: 'aw1', verifiedBy: 'verifier-1' }),
    );
  });
});
