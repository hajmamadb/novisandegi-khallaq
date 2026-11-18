import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Spec Phase 2 — per-user exercise series (progression tracks).
 *
 * Four series types, each with a fixed ordered checklist stored in
 * `remainingJson` (not yet done) and `doneJson` (completed, in completion
 * order). Progress is advanced by the `track()` hook called from
 * `SessionsService.submit()`.
 *
 * SENSES         — five sensory dimensions of one place (بینا/شنوا/بویا/چشایی/لمس)
 * PERSPECTIVE    — write the same scene from N character viewpoints
 * MORNING_PAGES  — N consecutive morning-page sessions
 * WORD_GOAL      — N total words (cumulative)
 *
 * DECISION: `contextId` is not used in Phase 2 — it is reserved for a
 * future "series tied to a specific bank item" feature (e.g. one series
 * per place for SENSES). Kept in the model for forward compatibility.
 */

const SENSE_KEYS = ['بینا', 'شنوا', 'بویا', 'چشایی', 'لمس'] as const;
type SenseKey = (typeof SENSE_KEYS)[number];

const PERSPECTIVE_COUNT = 3; // DECISION: 3 viewpoints per scene
const DEFAULT_MORNING_PAGES = 7;
const DEFAULT_WORD_GOAL = 1000;

export interface SeriesItem {
  key: string;
  label: string;
  done: boolean;
  doneAt?: string;
}

export interface SeriesDto {
  id: string;
  seriesType: string;
  status: string;
  remaining: SeriesItem[];
  done: SeriesItem[];
  total: number;
  completed: number;
  progressPct: number;
  target: number; // for WORD_GOAL: word target; for others: item count
  current: number; // for WORD_GOAL: words so far; for others: done count
  lastActiveAt: string;
}

@Injectable()
export class SeriesService {
  // The explicit token preserves NestJS injection while allowing lightweight unit-test mocks.
  prisma: any;

  constructor(@Inject(PrismaService) prisma: any) {
    this.prisma = prisma;
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  /**
   * List all active series for a user, each with its progress shape.
   * SENSES and PERSPECTIVE are lazily initialised on first access.
   * MORNING_PAGES and WORD_GOAL must be started explicitly via `start()`.
   */
  async list(userId: string): Promise<SeriesDto[]> {
    const rows = await this.prisma.exerciseSeries.findMany({
      where: { userId },
      orderBy: { lastActiveAt: 'desc' },
    });

    // Ensure SENSES and PERSPECTIVE always exist (auto-init). Newly created
    // rows are appended directly — no re-read needed.
    const existing = new Set(rows.map((r: any) => r.seriesType as string));
    if (!existing.has('SENSES')) {
      const created = await this.prisma.exerciseSeries.create({
        data: {
          userId,
          seriesType: 'SENSES',
          remainingJson: this.initialSenses(),
          doneJson: [],
        },
      });
      rows.push(created);
    }
    if (!existing.has('PERSPECTIVE')) {
      const created = await this.prisma.exerciseSeries.create({
        data: {
          userId,
          seriesType: 'PERSPECTIVE',
          remainingJson: this.initialPerspective(),
          doneJson: [],
        },
      });
      rows.push(created);
    }

    return rows.map((r: any) => this.toDto(r));
  }

  /**
   * Fetch one series by type (no auto-init). Used by the practice page's
   * progress bar, which must not trigger SENSES/PERSPECTIVE creation as a
   * side effect of a read. Returns null when the user has no such series.
   */
  async getByType(userId: string, seriesType: string): Promise<SeriesDto | null> {
    const row = await this.prisma.exerciseSeries.findFirst({
      where: { userId, seriesType: seriesType as any, status: 'ACTIVE' as any },
    });
    if (!row) return null;
    return this.toDto(row);
  }

  /**
   * Explicitly start a MORNING_PAGES or WORD_GOAL series.
   * SENSES / PERSPECTIVE cannot be started this way (auto-init only).
   */
  async start(userId: string, type: string, options?: { target?: number }): Promise<SeriesDto> {
    if (type === 'SENSES' || type === 'PERSPECTIVE') {
      throw new BadRequestException('SERIES_AUTO_INIT_ONLY');
    }
    if (type !== 'MORNING_PAGES' && type !== 'WORD_GOAL') {
      throw new BadRequestException('UNKNOWN_SERIES_TYPE');
    }

    // Only one active series per type per user.
    const existing = await this.prisma.exerciseSeries.findFirst({
      where: { userId, seriesType: type as any, status: 'ACTIVE' as any },
    });
    if (existing) {
      throw new BadRequestException('SERIES_ALREADY_ACTIVE');
    }

    const target =
      type === 'WORD_GOAL'
        ? options?.target ?? DEFAULT_WORD_GOAL
        : options?.target ?? DEFAULT_MORNING_PAGES;

    const row = await this.prisma.exerciseSeries.create({
      data:
        type === 'WORD_GOAL'
          ? { userId, seriesType: 'WORD_GOAL', remainingJson: [{ key: 'words', label: `هدف: ${target} کلمه` }], doneJson: [] }
          : {
              userId,
              seriesType: 'MORNING_PAGES',
              remainingJson: Array.from({ length: target }, (_, i) => ({
                key: `day-${i + 1}`,
                label: `روز ${i + 1}`,
              })),
              doneJson: [],
            },
    });

    return this.toDto(row);
  }

  /**
   * Advance progress for a given series type. Called from
   * SessionsService.submit() via fire-and-forget (never blocks submit).
   *
   * SENSES: the `exercise.slug` determines the sense dimension.
   * PERSPECTIVE: each `perspectives` slug submit advances one slot.
   * MORNING_PAGES: each submit of a morning-pages-family slug advances one day.
   * WORD_GOAL: `wordCount` is accumulated into `current`.
   */
  async track(
    userId: string,
    seriesType: string,
    payload: { slug?: string; wordCount?: number },
  ): Promise<void> {
    const row = await this.prisma.exerciseSeries.findFirst({
      where: { userId, seriesType: seriesType as any, status: 'ACTIVE' as any },
    });
    if (!row) return; // no active series of this type — no-op

    const remaining = (row.remainingJson as SeriesItem[]) ?? [];
    const done = (row.doneJson as SeriesItem[]) ?? [];

    if (seriesType === 'SENSES') {
      // DECISION: the `five-senses` exercise is the only senses-family slug in
      // Phase 2. One place, five senses — each qualifying submit advances the
      // series to the NEXT remaining sense (بینا→شنوا→بویا→چشایی→لمس) so all
      // five can complete. The sense is implicit in the sequence, not in the slug.
      if (slugToSense(payload.slug ?? '') === null) return; // not a senses-family slug
      if (remaining.length === 0) return; // already complete
      const idx = 0; // first remaining sense = the next one to do
      const [item] = remaining.splice(idx, 1);
      item.done = true;
      item.doneAt = new Date().toISOString();
      done.push(item);
      if (remaining.length === 0) {
        await this.prisma.exerciseSeries.update({
          where: { id: row.id },
          data: { remainingJson: remaining, doneJson: done, status: 'COMPLETED' },
        });
      } else {
        await this.prisma.exerciseSeries.update({
          where: { id: row.id },
          data: { remainingJson: remaining, doneJson: done, lastActiveAt: new Date() },
        });
      }
      return;
    }

    if (seriesType === 'PERSPECTIVE') {
      if (payload.slug !== 'perspectives') return;
      if (done.length >= PERSPECTIVE_COUNT) return;
      const nextIdx = done.length; // 0, 1, 2
      const idx = remaining.findIndex((i) => i.key === `view-${nextIdx + 1}`);
      if (idx === -1) return;
      const [item] = remaining.splice(idx, 1);
      item.done = true;
      item.doneAt = new Date().toISOString();
      done.push(item);
      if (remaining.length === 0) {
        await this.prisma.exerciseSeries.update({
          where: { id: row.id },
          data: { remainingJson: remaining, doneJson: done, status: 'COMPLETED' },
        });
      } else {
        await this.prisma.exerciseSeries.update({
          where: { id: row.id },
          data: { remainingJson: remaining, doneJson: done, lastActiveAt: new Date() },
        });
      }
      return;
    }

    if (seriesType === 'MORNING_PAGES') {
      if (payload.slug !== 'morning-pages') return;
      const idx = remaining.findIndex((i) => i.key === `day-${done.length + 1}`);
      if (idx === -1) return;
      const [item] = remaining.splice(idx, 1);
      item.done = true;
      item.doneAt = new Date().toISOString();
      done.push(item);
      if (remaining.length === 0) {
        await this.prisma.exerciseSeries.update({
          where: { id: row.id },
          data: { remainingJson: remaining, doneJson: done, status: 'COMPLETED' },
        });
      } else {
        await this.prisma.exerciseSeries.update({
          where: { id: row.id },
          data: { remainingJson: remaining, doneJson: done, lastActiveAt: new Date() },
        });
      }
      return;
    }

    if (seriesType === 'WORD_GOAL') {
      const words = payload.wordCount ?? 0;
      const item = remaining[0];
      if (!item) return;
      // Track cumulative words in a synthetic done entry's label.
      // remainingJson[0] carries the running total in its `key` suffix.
      const current = done.length > 0 ? (done as any)[done.length - 1].words ?? 0 : 0;
      const newTotal = current + words;
      const updated = { ...item, label: `هدف: ${targetFromLabel(item.label)} کلمه · تاکنون: ${newTotal}` };
      // Store the running total on a hidden done sentinel.
      const doneWithTotal: (SeriesItem & { words?: number })[] = [
        ...(done as (SeriesItem & { words?: number })[]),
        { key: `_total`, label: '', done: true, doneAt: new Date().toISOString(), words: newTotal },
      ];
      await this.prisma.exerciseSeries.update({
        where: { id: row.id },
        data: {
          remainingJson: [updated],
          doneJson: doneWithTotal,
          lastActiveAt: new Date(),
        },
      });
      return;
    }
  }

  /** Suspend an active series (e.g. user pauses a word goal). */
  async suspend(userId: string, seriesId: string): Promise<SeriesDto> {
    const row = await this.prisma.exerciseSeries.findUnique({ where: { id: seriesId } });
    if (!row) throw new NotFoundException('SERIES_NOT_FOUND');
    if (row.userId !== userId) throw new BadRequestException('SERIES_FORBIDDEN');
    if (row.status !== 'ACTIVE') throw new BadRequestException('SERIES_NOT_ACTIVE');
    const updated = await this.prisma.exerciseSeries.update({
      where: { id: seriesId },
      data: { status: 'SUSPENDED' },
    });
    return this.toDto(updated);
  }

  /** Resume a suspended series. */
  async resume(userId: string, seriesId: string): Promise<SeriesDto> {
    const row = await this.prisma.exerciseSeries.findUnique({ where: { id: seriesId } });
    if (!row) throw new NotFoundException('SERIES_NOT_FOUND');
    if (row.userId !== userId) throw new BadRequestException('SERIES_FORBIDDEN');
    if (row.status !== 'SUSPENDED') throw new BadRequestException('SERIES_NOT_SUSPENDED');
    const updated = await this.prisma.exerciseSeries.update({
      where: { id: seriesId },
      data: { status: 'ACTIVE', lastActiveAt: new Date() },
    });
    return this.toDto(updated);
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  private initialSenses(): SeriesItem[] {
    return SENSE_KEYS.map((k) => ({ key: k, label: k, done: false }));
  }

  private initialPerspective(): SeriesItem[] {
    return Array.from({ length: PERSPECTIVE_COUNT }, (_, i) => ({
      key: `view-${i + 1}`,
      label: `دیدگاه ${i + 1}`,
      done: false,
    }));
  }

  private toDto(row: any): SeriesDto {
    const remaining = (row.remainingJson as SeriesItem[]) ?? [];
    const done = (row.doneJson as (SeriesItem & { words?: number })[]) ?? [];
    const total = remaining.length + done.filter((d) => d.key !== '_total').length;
    const completed = done.filter((d) => d.key !== '_total').length;

    // WORD_GOAL special case: use the _total sentinel for current/target.
    if (row.seriesType === 'WORD_GOAL') {
      const sentinel = done.find((d) => d.key === '_total');
      const current = sentinel?.words ?? 0;
      const target = targetFromLabel(remaining[0]?.label ?? '') || DEFAULT_WORD_GOAL;
      return {
        id: row.id,
        seriesType: row.seriesType,
        status: row.status,
        remaining: remaining.map(({ label }) => ({ key: 'words', label, done: false })),
        done: [],
        total,
        completed,
        progressPct: total > 0 ? Math.round((current / target) * 100) : 0,
        target,
        current,
        lastActiveAt: row.lastActiveAt.toISOString(),
      };
    }

    return {
      id: row.id,
      seriesType: row.seriesType,
      status: row.status,
      remaining,
      done,
      total,
      completed,
      progressPct: total > 0 ? Math.round((completed / total) * 100) : 0,
      target: total,
      current: completed,
      lastActiveAt: row.lastActiveAt.toISOString(),
    };
  }
}

// ------------------------------------------------------------------
// Pure helpers (exported for unit tests)
// ------------------------------------------------------------------

/** Map an exercise slug to its SENSES dimension key, or null. */
export function slugToSense(slug: string): SenseKey | null {
  // DECISION: the `five-senses` exercise is the only senses-family slug in
  // Phase 2. Future per-sense variants (e.g. `senses-sight`) would map
  // here too.
  if (slug === 'five-senses') return 'بینا'; // DECISION: first sense = بینا
  return null;
}

/** Extract the numeric target from a WORD_GOAL label like "هدف: 1000 کلمه". */
export function targetFromLabel(label: string): number {
  const m = label.match(/هدف:\s*(\d+)/);
  return m ? Number(m[1]) : 0;
}
