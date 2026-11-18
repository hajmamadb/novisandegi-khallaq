import { Injectable, Logger } from '@nestjs/common';
import { Prisma, StreakDayStatus } from '@prisma/client';
import { startOfDay, subDays } from 'date-fns';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { FREEZE_EVERY_N_DAYS, FREEZE_MAX, STREAK_MIN_WORDS, XpService } from './xp.service';
import { QuestService } from './quests/quest.service';

/**
 * Spec E.6 — streak maintenance.
 *
 * Two entry points:
 *  - onSubmitted(): called from the submit flow after a PASSED submission
 *    with enough words; extends today's ACTIVE day and the running streak.
 *  - runMidnight(): scheduled at midnight Tehran time; for every user with a
 *    live streak, either consumes a freeze (yesterday FREEZE) or breaks the
 *    streak (yesterday MISSED, currentStreak = 0).
 */
@Injectable()
export class StreakService {
  private readonly logger = new Logger(StreakService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly xp: XpService,
    private readonly quests: QuestService,
  ) {}

  /**
   * Extend the streak after a qualifying submission (PASSED, wordCount >= 50).
   * Returns the new currentStreak (or 0 when the streak does not apply).
   */
  async onSubmitted(userId: string, wordCount: number): Promise<number> {
    if (wordCount < STREAK_MIN_WORDS) return 0;
    const now = new Date();
    const today = startOfDay(now);
    const yesterday = startOfDay(subDays(now, 1));

    const existing = await this.prisma.streakDay.findUnique({
      where: { userId_date: { userId, date: today } },
    });
    // Already counted today (a second qualifying submission) — no change.
    if (existing) return (await this.xp.getOrCreateStats(userId)).currentStreak;

    await this.prisma.streakDay.create({
      data: { userId, date: today, status: StreakDayStatus.ACTIVE },
    });

    const yesterdayActive = await this.prisma.streakDay.findFirst({
      where: { userId, date: yesterday, status: StreakDayStatus.ACTIVE },
    });
    const stats = await this.xp.getOrCreateStats(userId);
    const currentStreak = yesterdayActive ? stats.currentStreak + 1 : 1;
    const bestStreak = Math.max(stats.bestStreak, currentStreak);

    // Every 7th consecutive day grants a freeze (capped at FREEZE_MAX = 2).
    let freezesRemaining = stats.freezesRemaining;
    if (currentStreak % FREEZE_EVERY_N_DAYS === 0) {
      freezesRemaining = Math.min(FREEZE_MAX, freezesRemaining + 1);
    }

    await this.prisma.userStats.update({
      where: { userId },
      data: { currentStreak, bestStreak, freezesRemaining },
    });

    // DECISION: streak_extended event carries trigger=streak.updated so the
    // step-10 badge engine can pick it up from the normal badge-evaluate job
    // that logRaw already enqueues.
    await this.events.logRaw(userId, 'streak_extended', {
      currentStreak,
      bestStreak,
      freezesRemaining,
      trigger: 'streak.updated',
    });

    // DECISION (I.10): the today-exercise quest fires on the first qualifying
    // submission of the day — same condition as the streak's ACTIVE day.
    // Fire-and-forget: a quest-row hiccup must not break the streak flow.
    try {
      await this.quests.recordProgress(userId, 'daily.today-exercise');
    } catch (err) {
      this.logger.error(`today-exercise quest progress failed for ${userId}`, err as Error);
    }

    return currentStreak;
  }

  /**
   * Midnight Tehran sweep (spec E.6 cron). For each user whose streak is
   * still alive, look at yesterday: an ACTIVE/FREEZE/REST day means they
   * were active — nothing to do. Otherwise consume a freeze or break.
   */
  async runMidnight(): Promise<void> {
    const users = await this.prisma.userStats.findMany({
      where: { currentStreak: { gt: 0 } },
      select: { userId: true },
    });
    const yesterday = startOfDay(subDays(new Date(), 1));

    for (const { userId } of users) {
      try {
        await this.settleUser(userId, yesterday);
      } catch (err) {
        // One bad user must not stop the sweep.
        this.logger.error(`streak midnight settle failed for ${userId}`, err as Error);
      }
    }
  }

  private async settleUser(userId: string, yesterday: Date): Promise<void> {
    const hadYesterday = await this.prisma.streakDay.findFirst({
      where: { userId, date: yesterday },
    });
    // Yesterday already counted as active/freeze/rest → streak carries on.
    if (hadYesterday) return;

    const stats = await this.xp.getOrCreateStats(userId);
    if (stats.currentStreak <= 0) return;

    if (stats.freezesRemaining > 0) {
      await this.prisma.streakDay.create({
        data: { userId, date: yesterday, status: StreakDayStatus.FREEZE },
      });
      await this.prisma.userStats.update({
        where: { userId },
        data: { freezesRemaining: stats.freezesRemaining - 1 },
      });
      await this.events.logRaw(userId, 'streak_freeze_used', {
        freezesRemaining: stats.freezesRemaining - 1,
      });
      return;
    }

    await this.prisma.streakDay.create({
      data: {
        userId,
        date: yesterday,
        status: StreakDayStatus.MISSED,
        reason: 'no_active_day',
      },
    });
    await this.prisma.userStats.update({
      where: { userId },
      data: { currentStreak: 0 },
    });
    await this.events.logRaw(userId, 'streak_broken', {
      previousStreak: stats.currentStreak,
    });
  }
}
