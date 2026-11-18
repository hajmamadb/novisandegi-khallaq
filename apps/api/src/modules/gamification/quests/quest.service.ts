import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Quest, UserQuest } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { levelFromXp } from '../xp.service';

export interface TodayQuest {
  id: string;
  slug: string;
  titleFa: string;
  type: string;
  conditionJson: Prisma.JsonValue;
  rewardXp: number;
  rewardInk: number;
  progress: number;
  target: number;
  completedAt: Date | null;
  claimed: boolean;
}

export interface SkillSummary {
  skillKey: string;
  xpTotal: number;
  level: number;
  sessionsCount: number;
}

/**
 * Spec I.10 — daily quests.
 *
 * Three seeded daily quests (seed.ts "9. Quests"):
 *  - daily.today-exercise  (exercise_submitted: 1)      — hook: StreakService.onSubmitted
 *  - daily.one-variety     (exercise_from_least_category: 1) — hook: sessions submit
 *  - daily.reflection      (reflection_word_min: 30)    — INACTIVE (no reflection model yet)
 *
 * DECISION: "claimed" is derived from completedAt !== null — the schema has no
 * separate claimedAt column, so claiming = stamping completedAt. One claim per
 * user per quest per dateKey (the @@unique row) is enforced by the
 * completedAt == null guard in claim().
 */
@Injectable()
export class QuestService {
  constructor(private readonly prisma: PrismaService) {}

  /** Today's date key — UTC YYYY-MM-DD (schema dateKey column, locked). */
  private static dateKey(now: Date = new Date()): string {
    return now.toISOString().slice(0, 10);
  }

  /**
   * GET /gamification/quests/today — list today's active quests with
   * progress, creating the day's UserQuest rows on first touch.
   */
  async today(userId: string): Promise<TodayQuest[]> {
    const dateKey = QuestService.dateKey();
    const quests = await this.prisma.quest.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    const rows = await this.ensureRows(userId, quests, dateKey);
    return rows.map((uq) => this.toTodayQuest(uq));
  }

  /** Create missing UserQuest rows for the given quests on the given day. */
  private async ensureRows(
    userId: string,
    quests: (Quest | { id: string; conditionJson: Prisma.JsonValue })[],
    dateKey: string,
  ): Promise<(UserQuest & { quest: Quest })[]> {
    const rows: (UserQuest & { quest: Quest })[] = [];
    for (const quest of quests) {
      const target = this.targetFromCondition(quest);
      const row = await this.prisma.userQuest.upsert({
        where: { userId_questId_dateKey: { userId, questId: quest.id, dateKey } },
        create: { userId, questId: quest.id, dateKey, target, progress: 0 },
        update: {},
        include: { quest: true },
      });
      rows.push(row);
    }
    return rows;
  }

  /**
   * The numeric value of the first condition entry is the target
   * (e.g. { exercise_submitted: 1 } → 1, { reflection_word_min: 30 } → 30).
   */
  private targetFromCondition(quest: { conditionJson: Prisma.JsonValue }): number {
    const cond = quest.conditionJson as Record<string, unknown> | null;
    if (cond && typeof cond === 'object') {
      for (const value of Object.values(cond)) {
        if (typeof value === 'number') return value;
      }
    }
    // DECISION: a condition with no numeric value counts as a single task.
    return 1;
  }

  private toTodayQuest(uq: UserQuest & { quest: Quest }): TodayQuest {
    const q = uq.quest;
    return {
      id: uq.id,
      slug: q.slug,
      titleFa: q.titleFa,
      type: q.type,
      conditionJson: q.conditionJson,
      rewardXp: q.rewardXp,
      rewardInk: q.rewardInk,
      progress: uq.progress,
      target: uq.target,
      completedAt: uq.completedAt,
      claimed: uq.completedAt !== null,
    };
  }

  /**
   * Bump today's progress for a quest. Called from the submit-flow hooks.
   * Unknown/missing rows are created on the fly (progress is cumulative up
   * to target); an already-completed quest is left untouched.
   */
  async recordProgress(userId: string, questSlug: string, amount = 1): Promise<void> {
    const quest = await this.prisma.quest.findUnique({ where: { slug: questSlug } });
    if (!quest || !quest.isActive) return;
    const dateKey = QuestService.dateKey();
    const target = this.targetFromCondition(quest);

    await this.prisma.userQuest.upsert({
      where: { userId_questId_dateKey: { userId, questId: quest.id, dateKey } },
      create: { userId, questId: quest.id, dateKey, target, progress: Math.min(amount, target) },
      update: {
        progress: { increment: amount },
      },
    });
    // Clamp overflow (concurrent hooks) and stamp completion when target hit.
    await this.settle(userId, quest.id, dateKey, target);
  }

  /** Cap progress at target and mark completed when the target is reached. */
  private async settle(
    userId: string,
    questId: string,
    dateKey: string,
    target: number,
  ): Promise<void> {
    const row = await this.prisma.userQuest.findUnique({
      where: { userId_questId_dateKey: { userId, questId, dateKey } },
    });
    if (!row || row.completedAt) return;
    const progress = Math.min(row.progress, target);
    await this.prisma.userQuest.update({
      where: { id: row.id },
      data: {
        progress,
        completedAt: progress >= target ? new Date() : null,
      },
    });
  }

  /**
   * POST /gamification/quests/:id/claim — claim the reward for a completed
   * quest (id = UserQuest.id). Grants ink (InkTransaction) and/or XP
   * (XPLedger + UserStats) in one transaction.
   *
   * DECISION: the schema has no claimedAt column, so claimed state is DERIVED:
   * an InkTransaction with sourceId = userQuest.id is the "already claimed"
   * marker. Claim is idempotency-guarded by a findFirst on that marker (a
   * race would double-grant at worst once — accepted, matches the ledger's
   * append-only audit style).
   */
  async claim(userId: string, userQuestId: string): Promise<TodayQuest> {
    const row = await this.prisma.userQuest.findUnique({
      where: { id: userQuestId },
      include: { quest: true },
    });
    if (!row || row.userId !== userId) throw new NotFoundException('QUEST_NOT_FOUND');
    if (!row.completedAt) throw new BadRequestException('QUEST_NOT_COMPLETE');

    const alreadyClaimed = await this.prisma.inkTransaction.findFirst({
      where: { userId, sourceId: row.id, reason: 'quest_reward' },
      select: { id: true },
    });
    if (alreadyClaimed) throw new BadRequestException('QUEST_ALREADY_CLAIMED');

    const { quest } = row;
    await this.prisma.$transaction(async (p) => {
      if (quest.rewardInk > 0) {
        await p.inkTransaction.create({
          data: {
            userId,
            delta: quest.rewardInk,
            reason: 'quest_reward',
            sourceId: row.id,
          },
        });
      }
      if (quest.rewardXp > 0) {
        await p.xPLedger.create({
          data: {
            userId,
            sourceType: 'QUEST',
            sourceId: row.id,
            base: quest.rewardXp,
            multipliersJson: { questSlug: quest.slug },
            finalXp: quest.rewardXp,
          },
        });
        const stats = await p.userStats.findUnique({ where: { userId } });
        const newTotal = (stats?.xpTotal ?? 0) + quest.rewardXp;
        await p.userStats.upsert({
          where: { userId },
          create: { userId, xpTotal: newTotal, level: levelFromXp(newTotal) },
          update: { xpTotal: { increment: quest.rewardXp }, level: levelFromXp(newTotal) },
        });
      }
    });

    return { ...this.toTodayQuest(row), claimed: true };
  }

  /**
   * GET /gamification/skills — all of the user's skill rows, ordered by
   * xpTotal desc (the web filters top-6 / zero-xp itself).
   */
  listSkills(userId: string): Promise<SkillSummary[]> {
    return this.prisma.userSkill
      .findMany({
        where: { userId },
        orderBy: { xpTotal: 'desc' },
        select: { skillKey: true, xpTotal: true, level: true, sessionsCount: true },
      })
      .then((rows) =>
        rows.map((r) => ({
          skillKey: r.skillKey,
          xpTotal: r.xpTotal,
          level: r.level,
          sessionsCount: r.sessionsCount,
        })),
      );
  }
}
