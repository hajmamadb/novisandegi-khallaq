import { Test, TestingModule } from '@nestjs/testing';
import { ApprovalStatus } from '@prisma/client';
import { AdminService } from './admin.service';
import { PrismaService } from '../../prisma/prisma.service';

// Only the 15 bank models used by countBank are needed as counters.
const BANK_MODELS = [
  'character', 'place', 'openingLine', 'styleParagraph', 'referenceStory',
  'newsItem', 'imageAsset', 'objectItem', 'emotionLexicon', 'whatIfQuestion',
  'structurePhrase', 'word', 'cutupText', 'ambientAudio', 'structureTemplate',
] as const;

describe('AdminService', () => {
  let service: AdminService;
  let prisma: Record<string, any>;

  // DECISION: these bank models have NO approval-status field (see countBank in
  // admin.service.ts), so the service calls .count() with no filter — there is
  // no meaningful "pending" concept for them.
  const NO_STATUS_MODELS = new Set(['word', 'ambientAudio', 'structureTemplate']);

  beforeEach(async () => {
    prisma = {};
    // Bank models: each .count returns total (10) or pending (1) depending on
    // the where filter — except the no-status models which are always plain 10.
    for (const m of BANK_MODELS) {
      const hasStatus = !NO_STATUS_MODELS.has(m);
      let callCount = 0;
      prisma[m] = {
        count: jest.fn(async (args?: { where?: { approvalStatus?: string; status?: string } }) => {
          const w = args?.where;
          const pendingFilter =
            w?.approvalStatus === ApprovalStatus.PENDING ||
            w?.status === ApprovalStatus.PENDING;
          callCount += 1;
          if (hasStatus) return pendingFilter ? 1 : 10;
          // No-status models: the service calls .count() twice with no args
          // (1st = total, 2nd = pending). Return 10 for total, 0 for pending.
          return callCount === 1 ? 10 : 0;
        }),
      };
    }
    prisma.user = {
      count: jest.fn(async () => 42),
      groupBy: jest.fn(async () => [
        { role: 'NOVICE', _count: { _all: 40 } },
        { role: 'ADMIN', _count: { _all: 2 } },
      ]),
    };
    prisma.exerciseSession = {
      count: jest.fn(async () => 100),
    };
    prisma.submission = {
      aggregate: jest.fn(async () => ({
        _sum: { wordCount: 5000, durationSeconds: 36000, xpAwarded: 1200 },
      })),
      groupBy: jest.fn(async () => [{ integrityResult: 'PASSED', _count: { _all: 90 } }]),
    };
    prisma.anomalyFlag = { count: jest.fn(async () => 5) };
    prisma.badge = { count: jest.fn(async () => 10) };
    prisma.badgeAward = { count: jest.fn(async () => 30) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(AdminService);
  });

  it('returns platform aggregates', async () => {
    const res = await service.overview();

    expect(res.users.total).toBe(42);
    expect(res.users.byRole).toEqual({ NOVICE: 40, ADMIN: 2 });
    expect(res.activity.sessionsTotal).toBe(100);
    expect(res.volume.totalWords).toBe(5000);
    expect(res.volume.totalMinutes).toBe(600);
    expect(res.volume.totalXpAwarded).toBe(1200);
    expect(res.integrity).toEqual({ PASSED: 90 });
    expect(res.anomalies.total).toBe(5);
    expect(res.badges).toEqual({ total: 10, awarded: 30 });

    // Every bank row: total=10. Models with an approval status get
    // pending=1/approved=9; the no-status models (word, ambientAudio,
    // structureTemplate) get pending=0/approved=10 (no pending concept).
    const noStatusKeys = new Set(['word', 'ambient_audio', 'structure_template']);
    expect(res.banks).toHaveLength(15);
    for (const b of res.banks) {
      expect(b.total).toBe(10);
      if (noStatusKeys.has(b.key)) {
        expect(b.pending).toBe(0);
        expect(b.approved).toBe(10);
      } else {
        expect(b.pending).toBe(1);
        expect(b.approved).toBe(9);
      }
    }
  });
});
