import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma, SessionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

// ------------------------------------------------------------------
// Query + result types
// ------------------------------------------------------------------

export interface TimelineQuery {
  status?: string;
  exerciseTypeId?: string;
  from?: string; // inclusive ISO lower bound on startedAt
  to?: string; // inclusive ISO upper bound on startedAt
  page?: number; // 1-based
  pageSize?: number; // default 20, max 100
}

export interface TimelineItem {
  id: string;
  status: string;
  startedAt: Date;
  endedAt: Date | null;
  exerciseType: {
    id: string;
    slug: string;
    title: string;
  } | null;
  wordCount: number | null;
  durationSeconds: number | null;
  xpAwarded: number | null;
  integrityResult: string | null;
  submittedAt: Date | null;
}

export interface TimelineResponse {
  items: TimelineItem[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface HistoryStats {
  totalSessions: number;
  completedSessions: number;
  abandonedSessions: number;
  totalWords: number;
  totalMinutes: number;
  avgWordsPerSession: number;
  totalXpAwarded: number;
  byExercise: { id: string; slug: string; titleFa: string; count: number; words: number }[];
  byIntegrity: Record<string, number>;
  byMonth: { month: string; count: number; words: number }[];
}

/** Normalize page/pageSize with sane bounds. */
function normalizePaging(page?: number, pageSize?: number): { page: number; pageSize: number } {
  const p = Math.max(1, Math.min(Number(page ?? 1) || 1, 10_000));
  const s = Math.max(1, Math.min(Number(pageSize ?? 20) || 20, 100));
  return { page: p, pageSize: s };
}

@Injectable()
export class HistoryService {
  constructor(private readonly prisma: PrismaService) {}

  // ------------------------------------------------------------------
  // GET /history/timeline
  // ------------------------------------------------------------------

  /** Paginated, filterable list of the owner's sessions, newest first. */
  async timeline(userId: string, query: TimelineQuery): Promise<TimelineResponse> {
    const { page, pageSize } = normalizePaging(query.page, query.pageSize);

    const where: Prisma.ExerciseSessionWhereInput = { userId };
    if (query.status) where.status = query.status as SessionStatus;
    if (query.exerciseTypeId) where.exerciseTypeId = query.exerciseTypeId;
    if (query.from || query.to) {
      where.startedAt = {};
      if (query.from) where.startedAt.gte = new Date(query.from);
      if (query.to) where.startedAt.lte = new Date(query.to);
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.exerciseSession.count({ where }),
      this.prisma.exerciseSession.findMany({
        where,
        include: {
          exerciseType: { select: { id: true, slug: true, title: true } },
          submission: { select: { wordCount: true, durationSeconds: true, xpAwarded: true, integrityResult: true, submittedAt: true } },
        },
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const items: TimelineItem[] = rows.map((r) => ({
      id: r.id,
      status: r.status,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      exerciseType: r.exerciseType,
      wordCount: r.submission?.wordCount ?? null,
      durationSeconds: r.submission?.durationSeconds ?? null,
      xpAwarded: r.submission?.xpAwarded ?? null,
      integrityResult: r.submission ? r.submission.integrityResult : null,
      submittedAt: r.submission?.submittedAt ?? null,
    }));

    return { items, total, page, pageSize, hasMore: page * pageSize < total };
  }

  // ------------------------------------------------------------------
  // GET /history/stats
  // ------------------------------------------------------------------

  /** Aggregate lifetime stats for the owner (completed sessions only for word/xp totals). */
  async stats(userId: string): Promise<HistoryStats> {
    // DECISION: separate awaits instead of a $transaction array because
    // groupBy inside the transaction literal defeats Prisma's type narrowing.
    const [totalSessions, completedSessions, abandonedSessions] = await Promise.all([
      this.prisma.exerciseSession.count({ where: { userId } }),
      this.prisma.exerciseSession.count({ where: { userId, status: SessionStatus.SUBMITTED } }),
      this.prisma.exerciseSession.count({ where: { userId, status: SessionStatus.ABANDONED } }),
    ]);

    const completedAgg = await this.prisma.submission.aggregate({
      where: { userId },
      _sum: { wordCount: true, durationSeconds: true, xpAwarded: true },
    });

    const byExerciseRows = await this.prisma.exerciseSession.groupBy({
      by: ['exerciseTypeId'],
      where: { userId, status: SessionStatus.SUBMITTED },
      _count: { _all: true },
    });

    // Per-exercise word sum: join submissions → sessions, group by exercise type.
    const byExerciseWordsRows = await this.prisma.$queryRaw<
      { exerciseTypeId: string; words: number }[]
    >`SELECT s."exercise_type_id" AS "exerciseTypeId",
             COALESCE(SUM(sub."word_count"), 0)::int AS words
        FROM exercise_sessions s
        JOIN submissions sub ON sub."session_id" = s.id
        WHERE s."user_id" = ${userId}
          AND s.status = 'SUBMITTED'
        GROUP BY s."exercise_type_id"`;
    const wordsByEx = new Map(
      byExerciseWordsRows.map((r) => [r.exerciseTypeId, r.words]),
    );

    const byIntegrityRows = await this.prisma.submission.groupBy({
      by: ['integrityResult'],
      where: { userId },
      _count: { _all: true },
    });

    // Monthly activity (last 12 months).
    const byMonthRows = await this.prisma.$queryRaw<
      { month: string; count: number; words: number }[]
    >`SELECT to_char(date_trunc('month', "submitted_at"), 'YYYY-MM') AS month,
             count(*)::int AS count,
             COALESCE(sum("word_count"), 0)::int AS words
        FROM submissions
        WHERE "user_id" = ${userId}
          AND "submitted_at" >= date_trunc('month', now()) - interval '11 months'
        GROUP BY 1
        ORDER BY 1`;

    const totalWords = completedAgg._sum.wordCount ?? 0;
    const totalDurationSec = completedAgg._sum.durationSeconds ?? 0;
    const totalXp = completedAgg._sum.xpAwarded ?? 0;
    const avgWords = completedSessions > 0 ? Math.round(totalWords / completedSessions) : 0;

    // Resolve exercise type details for the groupBy rows.
    const exerciseIds = byExerciseRows.map((r) => r.exerciseTypeId);
    const exerciseTypes = exerciseIds.length
      ? await this.prisma.exerciseType.findMany({
          where: { id: { in: exerciseIds } },
          select: { id: true, slug: true, title: true },
        })
      : [];
    const exMap = new Map(exerciseTypes.map((e) => [e.id, e]));

    const byExercise = byExerciseRows
      .map((r) => ({
        id: r.exerciseTypeId,
        slug: exMap.get(r.exerciseTypeId)?.slug ?? r.exerciseTypeId,
        titleFa: exMap.get(r.exerciseTypeId)?.title ?? '',
        count: r._count._all,
        words: wordsByEx.get(r.exerciseTypeId) ?? 0,
      }))
      .sort((a, b) => b.count - a.count);

    const byIntegrity: Record<string, number> = {};
    for (const r of byIntegrityRows) byIntegrity[r.integrityResult] = r._count._all;

    return {
      totalSessions,
      completedSessions,
      abandonedSessions,
      totalWords,
      totalMinutes: Math.round(totalDurationSec / 60),
      avgWordsPerSession: avgWords,
      totalXpAwarded: totalXp,
      byExercise,
      byIntegrity,
      byMonth: byMonthRows,
    };
  }

  // ------------------------------------------------------------------
  // GET /history/export?format=json|markdown
  // ------------------------------------------------------------------

  exportFormat(format: string): 'json' | 'markdown' {
    if (format === 'json' || format === 'markdown') return format;
    throw new BadRequestException('EXPORT_FORMAT_INVALID');
  }

  /** Build the full export payload for the owner. */
  async buildExport(userId: string, format: 'json' | 'markdown') {
    const data = await this.prisma.exerciseSession.findMany({
      where: { userId },
      include: {
        exerciseType: { select: { slug: true, title: true } },
        submission: true,
        drafts: { select: { contentText: true, versionNumber: true } },
      },
      orderBy: { startedAt: 'asc' },
    });

    const rows = data.map((s) => ({
      id: s.id,
      status: s.status,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      exercise: s.exerciseType?.title ?? null,
      exerciseSlug: s.exerciseType?.slug ?? null,
      wordCount: s.submission?.wordCount ?? null,
      durationSeconds: s.submission?.durationSeconds ?? null,
      xpAwarded: s.submission?.xpAwarded ?? null,
      integrityResult: s.submission?.integrityResult ?? null,
      submittedAt: s.submission?.submittedAt ?? null,
      finalContent: s.drafts.length
        ? [...s.drafts].sort((a, b) => b.versionNumber - a.versionNumber)[0].contentText
        : null,
    }));

    if (format === 'json') {
      return { format, exportedAt: new Date(), count: rows.length, sessions: rows };
    }

    // Markdown
    const lines: string[] = [
      '# تاریخچه جلسات — کارگاه',
      '',
      `تعداد کل: ${rows.length}`,
      '',
      '| تاریخ شروع | تمرین | وضعیت | کلمه | مدت (دقیقه) | XP | یکپارچگی |',
      '|---|---|---|---|---|---|---|',
    ];
    for (const r of rows) {
      const dur = r.durationSeconds != null ? Math.round(r.durationSeconds / 60) : '';
      lines.push(
        `| ${r.startedAt.toISOString()} | ${r.exercise ?? '-'} | ${r.status} | ${r.wordCount ?? '-'} | ${dur || '-'} | ${r.xpAwarded ?? '-'} | ${r.integrityResult ?? '-'} |`,
      );
    }
    return { format, exportedAt: new Date(), count: rows.length, markdown: lines.join('\n') };
  }
}
