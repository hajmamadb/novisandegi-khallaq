import { Injectable, Logger } from '@nestjs/common';
import { Prisma, Submission } from '@prisma/client';
import { startOfDay, subDays, subHours, differenceInCalendarDays } from 'date-fns';
import { PrismaService } from '../../prisma/prisma.service';

export interface XpMultiplierBreakdown {
  durationFactor: number;
  completionFactor: number;
  noveltyMultiplier: number;
  qualityMultiplier: number;
  consistencyBonus: number;
  difficultyFactor: number;
  firstTimeFactor: number;
  diminishing: number;
  dailyCapFactor: number;
}

export interface XpResult {
  base: number;
  finalXp: number;
  multipliers: XpMultiplierBreakdown;
  xpTotal: number;
  level: number;
  levelUps: number[];
}

const DAILY_CAP_HALF = 600;
const DAILY_CAP_FULL = 1000;
const STREAK_MIN_WORDS = 50;
const FREEZE_MAX = 2;
const FREEZE_EVERY_N_DAYS = 7;

/** Skill thresholds per spec E.5 — index i = level i+1. */
const SKILL_THRESHOLDS = [0, 200, 600, 1400, 3000, 6000, 12000, 25000];

/** Overall level from cumulative XP (spec E.5 closed form). */
export function levelFromXp(xp: number): number {
  if (xp < 100) return 1;
  const n = Math.floor((-80 + Math.sqrt(6400 + 80 * (100 + xp))) / 40);
  return Math.max(1, n + 1);
}

/** Per-skill level from cumulative skill XP (spec E.5 thresholds). */
export function skillLevelFromXp(xp: number): number {
  let level = 1;
  for (let i = 0; i < SKILL_THRESHOLDS.length; i += 1) {
    if (xp >= SKILL_THRESHOLDS[i]) level = i + 1;
    else break;
  }
  return level;
}

@Injectable()
export class XpService {
  private readonly logger = new Logger(XpService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Ensure a UserStats row exists for the user and return it. */
  async getOrCreateStats(userId: string) {
    let stats = await this.prisma.userStats.findUnique({ where: { userId } });
    if (!stats) {
      stats = await this.prisma.userStats.create({
        data: { userId },
      });
    }
    return stats;
  }

  /**
   * Spec E.5 calculateXp — compute, persist the XPLedger row, update
   * UserStats (xpTotal / level) and distribute per-skill XP. Returns the
   * breakdown so the submit response can surface it.
   */
  async awardForSubmission(submission: Submission, wordCount: number): Promise<XpResult> {
    const exercise = await this.prisma.exerciseType.findUniqueOrThrow({
      where: { id: (await this.prisma.exerciseSession.findUnique({ where: { id: submission.sessionId } }))!.exerciseTypeId },
    });
    const userId = submission.userId;
    const now = new Date();

    // --- multipliers (spec E.5, in listed order) ---
    const base = exercise.baseXp;
    const durationFactor = Math.min(
      submission.durationSeconds / Math.max(exercise.durationSeconds, 1),
      1.5,
    );
    const completionFactor =
      submission.integrityResult === 'PASSED' ? 1.0 : submission.integrityResult === 'WARNING' ? 0.8 : 0.3;

    const recentSameType = await this.prisma.eventLog.count({
      where: {
        userId,
        eventName: 'exercise_submitted',
        eventPayloadJson: { path: ['exerciseTypeId'], equals: exercise.id },
        serverTimestamp: { gte: subDays(now, 7) },
      },
    });
    const noveltyMultiplier = recentSameType > 0 ? 0.7 : 1.0;
    const qualityMultiplier = 1.0;

    const yesterdayActive = await this.prisma.streakDay.findFirst({
      where: {
        userId,
        date: startOfDay(subDays(now, 1)),
        status: 'ACTIVE',
      },
    });
    const consistencyBonus = yesterdayActive ? 1.1 : 1.0;
    const difficultyFactor = exercise.difficultyBase;

    const priorSessions = await this.prisma.exerciseSession.count({
      where: { userId, exerciseTypeId: exercise.id, status: 'SUBMITTED' },
    });
    const firstTimeFactor = priorSessions <= 1 ? 1.5 : 1.0;

    const last24h = await this.prisma.eventLog.count({
      where: {
        userId,
        eventName: 'exercise_submitted',
        eventPayloadJson: { path: ['exerciseTypeId'], equals: exercise.id },
        serverTimestamp: { gte: subHours(now, 24) },
      },
    });
    const diminishing = 1 / (1 + 0.3 * Math.max(0, last24h - 1));

    const todayXp = await this.prisma.xPLedger.aggregate({
      where: { userId, createdAt: { gte: startOfDay(now) } },
      _sum: { finalXp: true },
    });
    const todaySum = todayXp._sum.finalXp ?? 0;
    const dailyCapFactor = todaySum >= DAILY_CAP_FULL ? 0 : todaySum >= DAILY_CAP_HALF ? 0.5 : 1.0;

    const raw = base * durationFactor * completionFactor * difficultyFactor * firstTimeFactor;
    const finalXp = Math.round(
      raw * noveltyMultiplier * qualityMultiplier * consistencyBonus * diminishing * dailyCapFactor,
    );

    const multipliers: XpMultiplierBreakdown = {
      durationFactor: r4(durationFactor),
      completionFactor,
      noveltyMultiplier,
      qualityMultiplier,
      consistencyBonus,
      difficultyFactor,
      firstTimeFactor,
      diminishing: r4(diminishing),
      dailyCapFactor,
    };

    // --- persist ledger row ---
    await this.prisma.xPLedger.create({
      data: {
        userId,
        sourceType: 'EXERCISE',
        sourceId: submission.id,
        base,
        multipliersJson: multipliers as unknown as Prisma.InputJsonValue,
        finalXp,
      },
    });

    // --- stats: xpTotal / level (record level-ups) ---
    const stats = await this.getOrCreateStats(userId);
    const prevLevel = stats.level;
    const newXpTotal = stats.xpTotal + finalXp;
    const newLevel = levelFromXp(newXpTotal);
    const levelUps: number[] = [];
    for (let l = prevLevel + 1; l <= newLevel; l += 1) levelUps.push(l);

    // --- wordsTotal / activeDays / sessionsCount bookkeeping ---
    // DECISION: activeDays increments only on a new calendar day (tracked via
    // lastActiveDate); sessionsCount counts submitted sessions.
    const newDay =
      !stats.lastActiveDate ||
      differenceInCalendarDays(startOfDay(now), startOfDay(stats.lastActiveDate)) > 0;

    await this.prisma.userStats.update({
      where: { userId },
      data: {
        xpTotal: newXpTotal,
        level: newLevel,
        wordsTotal: stats.wordsTotal + wordCount,
        activeDays: stats.activeDays + (newDay ? 1 : 0),
        lastActiveDate: startOfDay(now),
        sessionsCount: stats.sessionsCount + 1,
      },
    });

    // --- per-skill distribution (spec E.5) ---
    const skillWeights = (exercise.skillWeightsJson ?? {}) as Record<string, number>;
    for (const [skillKey, weight] of Object.entries(skillWeights)) {
      if (typeof weight !== 'number' || weight <= 0) continue;
      const skillXp = Math.round(finalXp * weight);
      await this.prisma.userSkill.upsert({
        where: { userId_skillKey: { userId, skillKey } },
        create: {
          userId,
          skillKey,
          xpTotal: skillXp,
          level: skillLevelFromXp(skillXp),
          sessionsCount: 1,
        },
        update: {
          xpTotal: { increment: skillXp },
          sessionsCount: { increment: 1 },
        },
      });
      // Refresh the skill level from the running total.
      const updated = await this.prisma.userSkill.findUnique({
        where: { userId_skillKey: { userId, skillKey } },
      });
      if (updated) {
        await this.prisma.userSkill.update({
          where: { id: updated.id },
          data: { level: skillLevelFromXp(updated.xpTotal) },
        });
      }
    }

    return {
      base,
      finalXp,
      multipliers,
      xpTotal: newXpTotal,
      level: newLevel,
      levelUps,
    };
  }
}

function r4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export { STREAK_MIN_WORDS, FREEZE_MAX, FREEZE_EVERY_N_DAYS };
