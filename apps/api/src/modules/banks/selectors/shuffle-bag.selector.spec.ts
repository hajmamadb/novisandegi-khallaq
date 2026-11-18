// K.1 unit test: ShuffleBagSelector (spec E.3).
//
// Tests the pure algorithm paths (cycle init, weighted pick, cycle
// completion) with a mocked Prisma + Events. The seeded RNG is
// deterministic per (userId, bankType, day), so we test invariants
// (correct item shape, log row, cycle update) rather than a specific id.

import { BankType } from '@prisma/client';
import { ShuffleBagSelector } from './selector.service';

describe('ShuffleBagSelector', () => {
  let selector: ShuffleBagSelector;
  let prisma: {
    userCycle: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    selectionLog: { findMany: jest.Mock; create: jest.Mock };
    place: { findMany: jest.Mock; findUnique: jest.Mock };
  };
  const events = { logRaw: jest.fn() };

  const bank = BankType.PLACE;

  const cycleRow = (over: Record<string, unknown> = {}) => ({
    id: 'c1',
    userId: 'u1',
    bankType: bank,
    cycleNo: 1,
    itemIdsJson: ['p1', 'p2', 'p3'],
    usedItemIdsJson: [] as string[],
    isActive: true,
    ...over,
  });

  beforeEach(() => {
    prisma = {
      userCycle: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      selectionLog: { findMany: jest.fn(), create: jest.fn() },
      place: { findMany: jest.fn(), findUnique: jest.fn() },
    };
    events.logRaw = jest.fn();
    // Direct instantiation — bypasses NestJS DI to keep the test focused
    // on the algorithm. The prisma/events objects are the exact mocks.
    selector = new ShuffleBagSelector(
      prisma as any,
      events as any,
    );
  });

  it('starts a new cycle when none exists, then draws and logs', async () => {
    // Call order on userCycle.findFirst:
    //   1) select() → active cycle lookup → null
    //   2) startNewCycle() → last cycleNo lookup → { cycleNo: 0 }
    prisma.userCycle.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ cycleNo: 0 });

    // place.findMany is used by listUsableIds in two spots:
    //   startNewCycle (1x) and filterCandidates (1x for the first pass).
    // Both return the same three ids.
    prisma.place.findMany.mockResolvedValue([
      { id: 'p1' },
      { id: 'p2' },
      { id: 'p3' },
    ]);

    prisma.userCycle.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'c-new', ...data }),
    );

    // computeWeights → two selectionLog.findMany calls (recent + ever).
    prisma.selectionLog.findMany.mockResolvedValue([]);
    prisma.selectionLog.create.mockResolvedValue({ id: 'log-1' });
    prisma.userCycle.update.mockResolvedValue({});
    prisma.place.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve({ id: where.id, name: 'خانه' }),
    );

    const out = await selector.select({ userId: 'u1', bankType: bank });

    expect(out.item).toBeDefined();
    expect(out.item.id).toMatch(/p[123]/);
    expect(out.selectionLogId).toBe('log-1');
    expect(out.cyclePosition).toBe('1/3');
    expect(prisma.selectionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'u1',
          bankType: bank,
          algorithm: 'SHUFFLE_BAG',
          cycleId: 'c-new',
        }),
      }),
    );
    expect(events.logRaw).toHaveBeenCalledWith(
      'u1',
      'bank_item_selected',
      expect.objectContaining({ bankType: bank, algorithm: 'SHUFFLE_BAG' }),
      expect.anything(),
    );
  });

  it('marks the cycle complete when the last item is drawn', async () => {
    // Active cycle with 2 items, 1 already used → drawing the last one.
    prisma.userCycle.findFirst.mockResolvedValue(
      cycleRow({
        usedItemIdsJson: ['p1'],
        itemIdsJson: ['p1', 'p2'],
      }),
    );
    // filterCandidates → listUsableIds returns only p2 (the only remaining).
    prisma.place.findMany.mockResolvedValue([{ id: 'p2' }]);
    prisma.selectionLog.findMany.mockResolvedValue([]);
    prisma.selectionLog.create.mockResolvedValue({ id: 'log-2' });
    prisma.userCycle.update.mockResolvedValue({});
    prisma.place.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve({ id: where.id, name: 'بازار' }),
    );

    const out = await selector.select({ userId: 'u1', bankType: bank });

    expect(out.item.id).toBe('p2');
    expect(out.cyclePosition).toBe('2/2');
    // Expect a completion update: isActive=false + completedAt.
    const completionCall = prisma.userCycle.update.mock.calls.find(
      (call: unknown[]) =>
        (call[0] as { data?: { isActive?: boolean } }).data?.isActive === false,
    );
    expect(completionCall).toBeDefined();
  });

  it('throws 404 when the bank has no usable items', async () => {
    // No active cycle, and listUsableIds returns empty in startNewCycle.
    prisma.userCycle.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ cycleNo: 0 });
    prisma.place.findMany.mockResolvedValue([]);

    await expect(
      selector.select({ userId: 'u1', bankType: bank }),
    ).rejects.toThrow(/BANK_EMPTY/);
  });

  it('re-seeds from a fresh cycle when the current one is exhausted', async () => {
    // Active cycle with 1 item, already used → remaining is empty.
    prisma.userCycle.findFirst
      // select() #1: active cycle lookup
      .mockResolvedValueOnce(
        cycleRow({
          itemIdsJson: ['p1'],
          usedItemIdsJson: ['p1'],
        }),
      )
      // startNewCycle() inside the exhausted branch: last cycleNo lookup
      .mockResolvedValueOnce({ cycleNo: 1 });
    // listUsableIds: startNewCycle (1x) + filterCandidates (1x) — same ids.
    prisma.place.findMany.mockResolvedValue([
      { id: 'p1' },
      { id: 'p2' },
    ]);
    prisma.userCycle.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'c2', ...data }),
    );
    prisma.selectionLog.findMany.mockResolvedValue([]);
    prisma.selectionLog.create.mockResolvedValue({ id: 'log-3' });
    prisma.userCycle.update.mockResolvedValue({});
    prisma.place.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve({ id: where.id, name: 'چهارباغ' }),
    );

    const out = await selector.select({ userId: 'u1', bankType: bank });
    expect(out.item.id).toMatch(/p[12]/);
    expect(out.cyclePosition).toBe('1/2');
  });
});
