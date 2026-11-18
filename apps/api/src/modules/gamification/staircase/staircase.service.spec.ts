// K.2 unit test: StaircaseService (Spec Phase 2 — Word Target Staircase).
//
// Tests:
//  (a) get() lazily creates a rung-0 run and returns the correct DTO shape
//  (b) track() within ±10 % of target counts a hit
//  (c) track() outside ±10 % does NOT count a hit
//  (d) track() does not double-count on the same day
//  (e) after 3 hits the rung advances
//  (f) completing the last rung sets status=COMPLETED
//  (g) reset() goes back to rung 0
//  (h) track() on a COMPLETED run is a no-op

import { StaircaseService, WORD_LADDER } from './staircase.service';

const TODAY = new Date().toISOString().slice(0, 10);

describe('StaircaseService', () => {
  let service: StaircaseService;
  let prisma: {
    staircaseRun: {
      upsert: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };

  const makePrisma = () => {
    const p = {
      staircaseRun: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    return p;
  };

  beforeEach(() => {
    prisma = makePrisma();
    service = new StaircaseService(prisma as any);
  });

  const baseRow = (over: Record<string, unknown> = {}) => ({
    id: 'stair-1',
    userId: 'u1',
    rungIndex: 0,
    dayHitsJson: [] as string[],
    status: 'ACTIVE',
    createdAt: new Date('2026-11-01T00:00:00Z'),
    ...over,
  });

  // ── (a) get() lazily creates ──────────────────────────────────────────

  it('get() upserts and returns a rung-0 DTO', async () => {
    const row = baseRow();
    prisma.staircaseRun.upsert.mockResolvedValue(row);

    const dto = await service.get('u1');
    expect(dto.rungIndex).toBe(0);
    expect(dto.currentTarget).toBe(50);
    expect(dto.hitsRequired).toBe(3);
    expect(dto.status).toBe('ACTIVE');
    expect(dto.progressPct).toBe(0);
  });

  // ── (b) track() within tolerance ──────────────────────────────────────

  it('track() counts a hit when wordCount is within ±10 % of target', async () => {
    const row = baseRow({ dayHitsJson: [] });
    prisma.staircaseRun.findUnique.mockResolvedValue(row);
    prisma.staircaseRun.update.mockResolvedValue(baseRow({ dayHitsJson: [TODAY] }));

    // target = 50, low = 45, high = 55
    const result = await service.track('u1', 50);
    expect(result).toBe(true);
    expect(prisma.staircaseRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1' },
        data: expect.objectContaining({ dayHitsJson: [TODAY] }),
      }),
    );
  });

  // ── (c) track() outside tolerance ─────────────────────────────────────

  it('track() does NOT count a hit when wordCount is outside ±10 %', async () => {
    const row = baseRow({ dayHitsJson: [] });
    prisma.staircaseRun.findUnique.mockResolvedValue(row);

    // target = 50, low = 44 (floor 45), high = 55. 40 is below.
    const result = await service.track('u1', 40);
    expect(result).toBe(false);
    expect(prisma.staircaseRun.update).not.toHaveBeenCalled();
  });

  it('track() does NOT count a hit when wordCount is too high', async () => {
    const row = baseRow({ dayHitsJson: [] });
    prisma.staircaseRun.findUnique.mockResolvedValue(row);

    // target = 50, high = 55. 60 is above.
    const result = await service.track('u1', 60);
    expect(result).toBe(false);
    expect(prisma.staircaseRun.update).not.toHaveBeenCalled();
  });

  // ── (d) no double-count same day ──────────────────────────────────────

  it('track() does not double-count on the same day', async () => {
    const row = baseRow({ dayHitsJson: [TODAY] });
    prisma.staircaseRun.findUnique.mockResolvedValue(row);

    const result = await service.track('u1', 50);
    expect(result).toBe(false);
    expect(prisma.staircaseRun.update).not.toHaveBeenCalled();
  });

  // ── (e) rung advances after 3 hits ────────────────────────────────────

  it('advances rung after 3 successful days', async () => {
    // Already 2 hits recorded, today is the 3rd.
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
    const oneDayAgo = new Date(Date.now() - 1 * 86400000).toISOString().slice(0, 10);
    const row = baseRow({ dayHitsJson: [twoDaysAgo, oneDayAgo] });
    prisma.staircaseRun.findUnique.mockResolvedValue(row);
    // Simulate the updated row after promotion.
    prisma.staircaseRun.update.mockResolvedValue(
      baseRow({ rungIndex: 1, dayHitsJson: [] }),
    );

    const result = await service.track('u1', 50);
    expect(result).toBe(true);
    expect(prisma.staircaseRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1' },
        data: expect.objectContaining({ rungIndex: 1, dayHitsJson: [] }),
      }),
    );
  });

  // ── (f) last rung → COMPLETED ─────────────────────────────────────────

  it('sets status=COMPLETED when the last rung is finished', async () => {
    const lastRung = WORD_LADDER.length - 1; // 7 (target 1000)
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
    const oneDayAgo = new Date(Date.now() - 1 * 86400000).toISOString().slice(0, 10);
    const row = baseRow({
      rungIndex: lastRung,
      dayHitsJson: [twoDaysAgo, oneDayAgo],
    });
    prisma.staircaseRun.findUnique.mockResolvedValue(row);
    prisma.staircaseRun.update.mockResolvedValue(
      baseRow({ rungIndex: lastRung, status: 'COMPLETED', dayHitsJson: [] }),
    );

    // target = 1000, low = 900, high = 1100
    const result = await service.track('u1', 1000);
    expect(result).toBe(true);
    expect(prisma.staircaseRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1' },
        data: expect.objectContaining({ status: 'COMPLETED' }),
      }),
    );
  });

  // ── (g) reset() ───────────────────────────────────────────────────────

  it('reset() goes back to rung 0 with ACTIVE status', async () => {
    const row = baseRow({ rungIndex: 3, dayHitsJson: ['2026-11-01'] });
    prisma.staircaseRun.findUnique.mockResolvedValue(row);
    prisma.staircaseRun.update.mockResolvedValue(baseRow());

    const dto = await service.reset('u1');
    expect(dto.rungIndex).toBe(0);
    expect(dto.status).toBe('ACTIVE');
    expect(dto.currentTarget).toBe(50);
  });

  // ── (h) track() on COMPLETED is a no-op ───────────────────────────────

  it('track() on a COMPLETED run returns false without updating', async () => {
    const row = baseRow({ status: 'COMPLETED' });
    prisma.staircaseRun.findUnique.mockResolvedValue(row);

    const result = await service.track('u1', 50);
    expect(result).toBe(false);
    expect(prisma.staircaseRun.update).not.toHaveBeenCalled();
  });
});
