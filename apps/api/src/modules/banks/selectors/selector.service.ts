import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { BankType, Prisma, SelectionAlgorithm } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { EventsService } from '../../events/events.service';
import {
  BankItem,
  IBankSelector,
  SelectorInput,
  SelectorOutput,
  delegateFor,
  fetchItem,
  listUsableIds,
  usableWhere,
} from './selector.util';

/**
 * Deterministic 32-bit PRNG (mulberry32-style) seeded from a string.
 * Used so a (userId, bankType, day) triple always produces the same draw —
 * see spec E.3 `makeSeed`.
 */
function seededRandom(seedStr: string): () => number {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    const c = seedStr.charCodeAt(i);
    h = Math.imul(h ^ c, 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSeed(userId: string, bankType: BankType, day: string): string {
  return `${userId}:${bankType}:${day}`;
}

@Injectable()
export class SelectorService {
  private readonly logger = new Logger(SelectorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  /**
   * Public entry point used by SessionsService (spec E.2 step 2) and by the
   * `POST /banks/:bankType/draw` controller (spec D.6).
   *
   * Returns the drawn item, the SelectionLog id, and the cycle position.
   * Throws:
   *  - 501 if the bank type has no wired model (phase-2 banks).
   *  - 404 if the bank has no usable items (empty/filtered).
   *
   * Phase-2 `filters` param: field-level criteria passed through to the
   * selector. CONDITIONAL banks (OPENING_LINE, NEWS, REFERENCE_STORY) use
   * them to narrow the candidate pool before the weighted draw. Other
   * selector types ignore them (defensive).
   */
  async draw(
    userId: string,
    bankType: BankType,
    exerciseSlug?: string,
    sessionId?: string,
    filters?: Record<string, unknown>,
  ): Promise<SelectorOutput> {
    // 501 for unwired banks — clearer than letting the delegate lookup fail.
    let key: keyof import('@prisma/client').PrismaClient;
    try {
      key = delegateFor(bankType);
    } catch {
      throw new ServiceUnavailableException(
        `BANK_NOT_WIRED:${bankType}`,
      );
    }
    void key;

    const usable = await listUsableIds(this.prisma, bankType);
    if (usable.length === 0) {
      throw new NotFoundException(`BANK_EMPTY:${bankType}`);
    }

    const selector: IBankSelector = this.buildSelector(bankType);
    const input: SelectorInput = {
      userId,
      bankType,
      sessionId,
      filters,
    };
    return selector.select(input);
  }

  /**
   * Spec E.3 strategy table.
   * - SHUFFLE_BAG: CHARACTER, PLACE, IMAGE, OBJECT, WHAT_IF, CUTUP_TEXT,
   *   STRUCTURE_PHRASE, STRUCTURE_TEMPLATE (cycle-based, weighted).
   * - PURE_RANDOM: WORD, EMOTION (small lexicon, uniform pick).
   * - CONDITIONAL: OPENING_LINE, STYLE_PARAGRAPH, REFERENCE_STORY, NEWS.
   *   Phase 2: uses WeightedSelector (Efraimidis-Spirakis) with field-level
   *   conditional filters (genre/mood/difficulty/category/freshness).
   */
  private buildSelector(bankType: BankType): IBankSelector {
    switch (bankType) {
      case 'CHARACTER':
      case 'PLACE':
      case 'IMAGE':
      case 'OBJECT':
      case 'WHAT_IF':
      case 'CUTUP_TEXT':
      case 'STRUCTURE_PHRASE':
      case 'STRUCTURE_TEMPLATE':
        return new ShuffleBagSelector(this.prisma, this.events);
      case 'WORD':
      case 'EMOTION':
        return new PureRandomSelector(this.prisma, this.events);
      case 'OPENING_LINE':
      case 'STYLE_PARAGRAPH':
      case 'REFERENCE_STORY':
      case 'NEWS':
        return new ConditionalSelector(this.prisma, this.events);
      default:
        throw new ServiceUnavailableException(`BANK_NOT_WIRED:${bankType}`);
    }
  }
}

/**
 * WEIGHTED_RANDOM (spec G.1 — Efraimidis-Spirakis).
 *
 * Phase-2 implementation: a real weighted sampler without a UserCycle.
 * Each draw is independent — the candidate pool is filtered by field-level
 * criteria (genre / mood / difficulty / category / freshness), weighted by
 * recency + novelty, and the Efraimidis-Spirakis transform
 * `key = rng() ** (1 / weight)` picks the winner.
 *
 * This is distinct from ShuffleBagSelector: no cycle bookkeeping, no
 * usedItemIdsJson, no cyclePosition. The SelectionLog records
 * `algorithm: WEIGHTED_RANDOM`.
 */
export class WeightedSelector implements IBankSelector {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  async select(input: SelectorInput): Promise<SelectorOutput> {
    const { userId, bankType, sessionId, filters, excludeIds } = input;

    // 1. Fetch all usable items (full rows, not just ids — we need field
    //    values for the conditional filter and for the weight computation).
    const usable = await this.fetchUsableItems(bankType);
    const exclude = new Set(excludeIds ?? []);
    let candidates = usable.filter((row) => !exclude.has(row.id));

    // 2. Apply field-level conditional filters (genre/mood/difficulty/
    //    category/freshness) if the caller supplied them.
    if (filters && Object.keys(filters).length > 0) {
      candidates = candidates.filter((row) =>
        this.matchesFilters(row, bankType, filters),
      );
    }

    // 3. Relax: if filters eliminated everything, retry without filters.
    if (candidates.length === 0 && filters && Object.keys(filters).length > 0) {
      candidates = usable.filter((row) => !exclude.has(row.id));
    }

    if (candidates.length === 0) {
      throw new NotFoundException(`BANK_EMPTY:${bankType}`);
    }

    // 4. Compute weights (recency + novelty) — same formula as ShuffleBag.
    const weights = await this.computeWeights(candidates, userId, bankType);

    // 5. Efraimidis-Spirakis: key = rng() ** (1 / weight), pick max key.
    const seed = makeSeed(userId, bankType, new Date().toDateString());
    const rng = seededRandom(seed);
    const selected = this.efraimidisSpirakis(weights, rng);
    if (!selected) throw new NotFoundException(`BANK_EMPTY:${bankType}`);

    const log = await this.prisma.selectionLog.create({
      data: {
        userId,
        bankType,
        sessionId: sessionId ?? null,
        itemId: selected,
        algorithm: SelectionAlgorithm.WEIGHTED_RANDOM,
        weightsSnapshotJson: weights as unknown as Prisma.InputJsonValue,
        filtersJson: (filters ?? {}) as unknown as Prisma.InputJsonValue,
        alternativesCount: candidates.length - 1,
        seed,
      },
    });

    await this.events.logRaw(
      userId,
      'bank_item_selected',
      {
        bankType,
        itemId: selected,
        algorithm: 'WEIGHTED_RANDOM',
      },
      { sessionType: 'practice', sessionId },
    );

    const item = await fetchItem(this.prisma, bankType, selected);
    return { item, selectionLogId: log.id };
  }

  /**
   * Efraimidis-Spirakis weighted sampling without replacement (spec G.1).
   * `key = Math.pow(rng(), 1 / weight)`; the item with the highest key wins.
   * Higher weight → higher probability of being selected.
   */
  private efraimidisSpirakis(
    weights: Record<string, number>,
    rng: () => number,
  ): string | null {
    let bestKey = -Infinity;
    let selected: string | null = null;
    for (const [id, w] of Object.entries(weights)) {
      const safe = Math.max(w, 0.0001);
      const key = Math.pow(rng(), 1 / safe);
      if (key > bestKey) {
        bestKey = key;
        selected = id;
      }
    }
    return selected;
  }

  /**
   * Fetch full rows of all usable items for a bank.
   * Returns an array of objects with at least `{ id: string }` plus the
   * field-level columns the conditional filters need.
   */
  private async fetchUsableItems(
    bankType: BankType,
  ): Promise<Array<Record<string, unknown> & { id: string }>> {
    const key = delegateFor(bankType);
    const delegate = this.prisma[key] as unknown as {
      findMany: (args: {
        where: Record<string, unknown>;
        orderBy: { id: 'asc' };
      }) => Promise<Array<Record<string, unknown> & { id: string }>>;
    };
    return delegate.findMany({
      where: usableWhere(bankType),
      orderBy: { id: 'asc' },
    });
  }

  /**
   * Field-level conditional filter (phase-2).
   *
   * Supported filters per bank:
   *  - OPENING_LINE:  genre, mood, difficulty
   *  - NEWS:          category, maxAgeDays (freshness)
   *  - REFERENCE_STORY: genre
   *  - STYLE_PARAGRAPH: (no field-level filters in phase 2)
   *
   * Unknown bankType + filter keys are silently ignored (defensive).
   */
  protected matchesFilters(
    row: Record<string, unknown> & { id: string },
    bankType: BankType,
    filters: Record<string, unknown>,
  ): boolean {
    switch (bankType) {
      case 'OPENING_LINE': {
        if (filters.genre && row.genre !== filters.genre) return false;
        if (filters.mood && row.mood !== filters.mood) return false;
        if (filters.difficulty && row.difficulty !== filters.difficulty) return false;
        return true;
      }
      case 'NEWS': {
        if (filters.category && row.category !== filters.category) return false;
        if (filters.maxAgeDays != null && row.publishedAt) {
          const ageMs = Date.now() - new Date(row.publishedAt as string).getTime();
          const maxMs = Number(filters.maxAgeDays) * 24 * 3600 * 1000;
          if (ageMs > maxMs) return false;
        }
        return true;
      }
      case 'REFERENCE_STORY': {
        if (filters.genre && row.genre !== filters.genre) return false;
        return true;
      }
      default:
        return true;
    }
  }

  /**
   * Weighting (same formula as ShuffleBagSelector.computeWeights):
   * base 1.0, +0.5 novelty, -0.25 recency (30 d), clamp [0.25, 4].
   */
  private async computeWeights(
    candidates: Array<Record<string, unknown> & { id: string }>,
    userId: string,
    bankType: BankType,
  ): Promise<Record<string, number>> {
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const recent = await this.prisma.selectionLog.findMany({
      where: { userId, bankType, createdAt: { gte: since } },
      select: { itemId: true },
    });
    const recentSet = new Set(recent.map((r) => r.itemId));
    const all = await this.prisma.selectionLog.findMany({
      where: { userId, bankType },
      select: { itemId: true },
      distinct: ['itemId'],
    });
    const everSet = new Set(all.map((r) => r.itemId));

    const weights: Record<string, number> = {};
    for (const row of candidates) {
      let w = 1.0;
      if (!everSet.has(row.id)) w += 0.5;
      if (recentSet.has(row.id)) w -= 0.25;
      weights[row.id] = Math.min(Math.max(w, 0.25), 4);
    }
    return weights;
  }
}

/**
 * SHUFFLE_BAG (spec E.3). Draws from the user's active cycle, marking used
 * items and rotating to a fresh cycle once all items have been used.
 */
export class ShuffleBagSelector implements IBankSelector {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  async select(input: SelectorInput): Promise<SelectorOutput> {
    const { userId, bankType, sessionId, filters } = input;

    let cycle = await this.prisma.userCycle.findFirst({
      where: { userId, bankType, isActive: true },
    });
    if (!cycle) {
      cycle = await this.startNewCycle(userId, bankType);
    }

    const itemIds = (cycle.itemIdsJson as unknown as string[]) ?? [];
    const usedIds = (cycle.usedItemIdsJson as unknown as string[]) ?? [];
    const remaining = itemIds.filter((id) => !usedIds.includes(id));

    let candidates = await this.filterCandidates(remaining, bankType, filters, input.excludeIds ?? []);
    if (candidates.length === 0) {
      // Relax: drop filters and exclusions, but stay inside the current cycle.
      candidates = await this.filterCandidates(remaining, bankType, {}, []);
      if (candidates.length === 0) {
        // Cycle exhausted — start a fresh one and reselect without filters.
        cycle = await this.startNewCycle(userId, bankType);
        const freshIds = (cycle.itemIdsJson as unknown as string[]) ?? [];
        candidates = await this.filterCandidates(freshIds, bankType, {}, []);
        if (candidates.length === 0) {
          throw new NotFoundException(`BANK_EMPTY:${bankType}`);
        }
        return this.select({ userId, bankType, sessionId });
      }
    }

    const weights = await this.computeWeights(candidates, userId, bankType);
    const seed = makeSeed(userId, bankType, new Date().toDateString());
    const rng = seededRandom(seed);

    const maxWeight = Math.max(...Object.values(weights));
    // DECISION: spec uses `Math.min(w, maxWeight / 4)` and then
    // `Math.pow(rng(), 1 / clamped)`. When maxWeight < 4, maxWeight / 4 < 1
    // and clamped can approach 0, making 1/clamped huge and the exponent
    // numerically unstable (and for w < maxWeight/4 the key becomes ~0).
    // We floor the denominator at 1 so the transform degrades to
    // `rng() ** (1/w)` for w >= 1, which preserves the "higher weight →
    // higher probability" invariant without the edge case.
    const denomFloor = 1;
    let bestKey = -1;
    let selected: string | null = null;
    for (const [id, w] of Object.entries(weights)) {
      const safe = Math.max(w, 0.0001);
      const clamped = Math.min(safe, maxWeight / 4);
      const denom = Math.max(clamped, denomFloor);
      const key = Math.pow(rng(), 1 / denom);
      if (key > bestKey) {
        bestKey = key;
        selected = id;
      }
    }
    if (!selected) throw new NotFoundException(`BANK_EMPTY:${bankType}`);

    const positionInCycle = `${usedIds.length + 1}/${itemIds.length}`;
    const log = await this.prisma.selectionLog.create({
      data: {
        userId,
        bankType,
        sessionId: sessionId ?? null,
        itemId: selected,
        algorithm: SelectionAlgorithm.SHUFFLE_BAG,
        cycleId: cycle.id,
        cyclePosition: positionInCycle,
        weightsSnapshotJson: weights as unknown as Prisma.InputJsonValue,
        filtersJson: (filters ?? {}) as unknown as Prisma.InputJsonValue,
        alternativesCount: candidates.length - 1,
        seed,
      },
    });

    await this.prisma.userCycle.update({
      where: { id: cycle.id },
      data: {
        usedItemIdsJson: [...usedIds, selected] as unknown as Prisma.InputJsonValue,
      },
    });

    if (usedIds.length + 1 >= itemIds.length) {
      await this.prisma.userCycle.update({
        where: { id: cycle.id },
        data: { isActive: false, completedAt: new Date() },
      });
    }

    await this.events.logRaw(
      userId,
      'bank_item_selected',
      {
        bankType,
        itemId: selected,
        cycleId: cycle.id,
        positionInCycle,
        algorithm: 'SHUFFLE_BAG',
      },
      { sessionType: 'practice', sessionId },
    );

    const item = await fetchItem(this.prisma, bankType, selected);
    return { item, selectionLogId: log.id, cyclePosition: positionInCycle };
  }

  private async startNewCycle(
    userId: string,
    bankType: BankType,
  ) {
    const ids = await listUsableIds(this.prisma, bankType);
    if (ids.length === 0) {
      throw new NotFoundException(`BANK_EMPTY:${bankType}`);
    }
    const lastCycle = await this.prisma.userCycle.findFirst({
      where: { userId, bankType },
      orderBy: { cycleNo: 'desc' },
      select: { cycleNo: true },
    });
    const cycleNo = (lastCycle?.cycleNo ?? 0) + 1;
    // DECISION: deterministic order (listUsableIds already sorts by
    // createdAt asc) so a freshly seeded bank produces a reproducible cycle.
    return this.prisma.userCycle.create({
      data: {
        userId,
        bankType,
        cycleNo,
        itemIdsJson: ids as unknown as Prisma.InputJsonValue,
        usedItemIdsJson: [] as unknown as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Apply phase-1 filters (just `excludeIds` for now) and drop any ids that
   * are no longer present in the bank (deleted / de-activated).
   */
  private async filterCandidates(
    ids: string[],
    bankType: BankType,
    filters: Record<string, unknown>,
    excludeIds: string[],
  ): Promise<string[]> {
    const usable = new Set(await listUsableIds(this.prisma, bankType));
    const exclude = new Set(excludeIds);
    void filters; // phase-1: no field-level filters wired yet
    return ids.filter((id) => usable.has(id) && !exclude.has(id));
  }

  /**
   * Weighting (spec E.3 "SHUFFLE_BAG با وزن‌دهی"): recency + novelty.
   * - base 1.0 for every candidate
   * - +0.5 if the item has never been selected by this user (novelty)
   * - -0.25 if the item was selected in the last 30 days (recency penalty)
   * Clamped to [0.25, 4].
   */
  private async computeWeights(
    candidates: string[],
    userId: string,
    bankType: BankType,
  ): Promise<Record<string, number>> {
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const recent = await this.prisma.selectionLog.findMany({
      where: { userId, bankType, createdAt: { gte: since } },
      select: { itemId: true },
    });
    const recentSet = new Set(recent.map((r) => r.itemId));
    const all = await this.prisma.selectionLog.findMany({
      where: { userId, bankType },
      select: { itemId: true },
      distinct: ['itemId'],
    });
    const everSet = new Set(all.map((r) => r.itemId));

    const weights: Record<string, number> = {};
    for (const id of candidates) {
      let w = 1.0;
      if (!everSet.has(id)) w += 0.5;
      if (recentSet.has(id)) w -= 0.25;
      weights[id] = Math.min(Math.max(w, 0.25), 4);
    }
    return weights;
  }
}

/**
 * PURE_RANDOM (spec E.3: WORD, EMOTION). Simple uniform pick, no cycle.
 * Logs the draw the same way ShuffleBag does so analytics are consistent.
 */
export class PureRandomSelector implements IBankSelector {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  async select(input: SelectorInput): Promise<SelectorOutput> {
    const { userId, bankType, sessionId, excludeIds } = input;
    const usable = await listUsableIds(this.prisma, bankType);
    const exclude = new Set(excludeIds ?? []);
    const candidates = usable.filter((id) => !exclude.has(id));
    if (candidates.length === 0) {
      throw new NotFoundException(`BANK_EMPTY:${bankType}`);
    }
    const seed = makeSeed(userId, bankType, new Date().toDateString());
    const rng = seededRandom(seed);
    const selected = candidates[Math.floor(rng() * candidates.length)];

    const log = await this.prisma.selectionLog.create({
      data: {
        userId,
        bankType,
        sessionId: sessionId ?? null,
        itemId: selected,
        algorithm: SelectionAlgorithm.PURE_RANDOM,
        weightsSnapshotJson: {} as unknown as Prisma.InputJsonValue,
        filtersJson: {} as unknown as Prisma.InputJsonValue,
        alternativesCount: candidates.length - 1,
        seed,
      },
    });

    await this.events.logRaw(
      userId,
      'bank_item_selected',
      { bankType, itemId: selected, algorithm: 'PURE_RANDOM' },
      { sessionType: 'practice', sessionId },
    );

    const item = await fetchItem(this.prisma, bankType, selected);
    return { item, selectionLogId: log.id };
  }
}

/**
 * CONDITIONAL (spec E.3: OPENING_LINE, STYLE_PARAGRAPH, REFERENCE_STORY, NEWS).
 *
 * Phase 2: extends WeightedSelector (Efraimidis-Spirakis) and inherits the
 * field-level conditional filters (`matchesFilters`) for genre / mood /
 * difficulty (OPENING_LINE), category / maxAgeDays (NEWS), and genre
 * (REFERENCE_STORY). The algorithm is WEIGHTED_RANDOM — no UserCycle.
 */
export class ConditionalSelector extends WeightedSelector {}
