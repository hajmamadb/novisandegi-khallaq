import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Spec Phase 2 — Word Target Staircase (پله‌ی کلمات).
 *
 * A single per-user progression track with a fixed ladder of word-count
 * targets: 50 → 100 → 150 → 200 → 300 → 500 → 750 → 1000.
 *
 * Rules:
 *  - The user starts on rung 0 (target 50).
 *  - A submission "hits" the current rung when wordCount is within ±10 %
 *    of the current target (i.e. 0.9 × target ≤ wordCount ≤ 1.1 × target).
 *  - After 3 successful days (each day may contribute at most one hit),
 *    the next rung unlocks and the day-hit list resets.
 *  - When the last rung is completed the status becomes COMPLETED.
 *
 * The `track()` method is called fire-and-forget from
 * `SessionsService.submit()` — the same pattern as `SeriesService.track()`.
 */

export const WORD_LADDER = [50, 100, 150, 200, 300, 500, 750, 1000] as const;
const HITS_REQUIRED = 3;
const TOLERANCE = 0.10; // ±10 %

export interface StaircaseDto {
  id: string;
  rungIndex: number;
  currentTarget: number;
  hitsToday: boolean;
  hitsThisRung: number; // number of days already logged for this rung
  hitsRequired: number;
  progressPct: number; // 0-100 across the whole ladder
  status: string;
  createdAt: string;
}

@Injectable()
export class StaircaseService {
  // The explicit token preserves NestJS injection while allowing lightweight unit-test mocks.
  prisma: any;

  constructor(@Inject(PrismaService) prisma: any) {
    this.prisma = prisma;
  }

  /**
   * GET /gamification/staircase — return (and lazily create) the user's
   * staircase run.
   */
  async get(userId: string): Promise<StaircaseDto> {
    const row = await this.prisma.staircaseRun.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        rungIndex: 0,
        dayHitsJson: [],
        status: 'ACTIVE',
      },
    });
    return this.toDto(row);
  }

  /**
   * Submit-path hook. Called fire-and-forget from SessionsService.submit().
   *
   * @param userId    the submitting user
   * @param wordCount word count of the just-submitted draft
   * @returns true if this submission counted as a hit on the current rung
   */
  async track(userId: string, wordCount: number): Promise<boolean> {
    const row = await this.prisma.staircaseRun.findUnique({
      where: { userId },
    });
    if (!row || row.status === 'COMPLETED') return false;

    const target = WORD_LADDER[row.rungIndex];
    if (target == null) return false; // safety: rungIndex out of bounds

    const low = Math.floor(target * (1 - TOLERANCE));
    const high = Math.ceil(target * (1 + TOLERANCE));
    if (wordCount < low || wordCount > high) return false;

    // Check whether today is already logged for this rung.
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const hits: string[] = Array.isArray(row.dayHitsJson)
      ? (row.dayHitsJson as string[])
      : [];
    if (hits.includes(today)) return false; // already counted today

    // Record today's hit.
    const newHits = [...hits, today];
    let updated;
    if (newHits.length >= HITS_REQUIRED) {
      // Promote to the next rung.
      const nextRung = row.rungIndex + 1;
      if (nextRung >= WORD_LADDER.length) {
        updated = await this.prisma.staircaseRun.update({
          where: { userId },
          data: {
            status: 'COMPLETED',
            dayHitsJson: [],
          },
        });
      } else {
        updated = await this.prisma.staircaseRun.update({
          where: { userId },
          data: {
            rungIndex: nextRung,
            dayHitsJson: [],
          },
        });
      }
    } else {
      updated = await this.prisma.staircaseRun.update({
        where: { userId },
        data: { dayHitsJson: newHits },
      });
    }

    return true;
  }

  /**
   * POST /gamification/staircase/reset — reset back to rung 0.
   */
  async reset(userId: string): Promise<StaircaseDto> {
    const row = await this.prisma.staircaseRun.findUnique({
      where: { userId },
    });
    if (!row) throw new NotFoundException('STAIRCASE_NOT_FOUND');

    const updated = await this.prisma.staircaseRun.update({
      where: { userId },
      data: {
        rungIndex: 0,
        dayHitsJson: [],
        status: 'ACTIVE',
      },
    });
    return this.toDto(updated);
  }

  toDto(row: {
    id: string;
    rungIndex: number;
    dayHitsJson: unknown;
    status: string;
    createdAt: Date;
  }): StaircaseDto {
    const hits: string[] = Array.isArray(row.dayHitsJson)
      ? (row.dayHitsJson as string[])
      : [];
    const today = new Date().toISOString().slice(0, 10);
    const progressPct =
      (row.rungIndex / WORD_LADDER.length) * 100;

    return {
      id: row.id,
      rungIndex: row.rungIndex,
      currentTarget: WORD_LADDER[Math.min(row.rungIndex, WORD_LADDER.length - 1)],
      hitsToday: hits.includes(today),
      hitsThisRung: Math.min(hits.length, HITS_REQUIRED),
      hitsRequired: HITS_REQUIRED,
      progressPct,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
