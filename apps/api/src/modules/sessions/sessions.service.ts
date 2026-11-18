import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  SessionStatus,
  DraftSaveTrigger,
  UserRole,
  IntegrityResult,
  BankType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { IntegrityService } from '../integrity/integrity.service';
import { SelectorService } from '../banks/selectors/selector.service';
import { XpService, XpResult } from '../gamification/xp.service';
import { StreakService } from '../gamification/streak.service';
import { QuestService } from '../gamification/quests/quest.service';
import { SeriesService } from '../gamification/series/series.service';
import { StaircaseService } from '../gamification/staircase/staircase.service';
import { ExerciseValidator } from '../exercises/exercise.validator';
import { canAccess } from '../../common/utils/role-rank.util';
import { fetchItem } from '../banks/selectors/selector.util';
import { CreateSessionDto } from './dto/create-session.dto';
import { SaveDraftDto } from './dto/save-draft.dto';
import { SubmitSessionDto } from './dto/submit-session.dto';

/** Spec K.2 "Reroll limit" (line 2660: REROLL_PER_SESSION_LIMIT=2). */
// DECISION: the spec (line 2660) lists a "reroll limit" of 2, but the
// implementation checks `session.rerollCount`, which is a per-session
// counter (not a per-day counter). The name REROLL_PER_SESSION_LIMIT
// reflects the actual semantics.
export const REROLL_PER_SESSION_LIMIT = 2;

export interface ListSessionsQuery {
  status?: SessionStatus;
  /** Inclusive lower bound for startedAt (ISO string). */
  from?: string;
  /** Inclusive upper bound for startedAt (ISO string). */
  to?: string;
}

/** Count words in a Persian/English mixed text. */
export function countWords(text: string): number {
  if (!text) return 0;
  // DECISION: whitespace-delimited tokens. For Persian this approximates
  // word count well enough for a soft warning threshold (not billing logic).
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ---------------------------------------------------------------------------
// Prompt snapshot normalization
// ---------------------------------------------------------------------------

/**
 * The practice page (apps/web .../practice/[sessionId]/page.tsx) reads
 * `promptSnapshotJson.sourceItemTitle` / `sourceItemContent` /
 * `sourceItemHint`. The raw bank rows have different shapes per model, so we
 * normalize them server-side here — once, in create() and reroll() — instead
 * of scattering switch-statements in the client.
 *
 * DECISION (five-senses): the SENSES series (always the same place until all
 * 5 senses are done) is phase-2 — the place bank has `suggestedSenses` but no
 * per-user sense progress is tracked yet. The hint lists all suggested senses
 * for now; the "one sense at a time, same place" lock lands with the series
 * implementation.
 */
export function promptFieldsForItem(
  bankType: BankType | null,
  item: unknown,
): {
  sourceItemTitle?: string;
  sourceItemContent?: string;
  sourceItemHint?: string;
  sourceName?: string;
  sourceUrl?: string;
} {
  const r = item as Record<string, unknown>;
  const str = (v: unknown): string | undefined =>
    typeof v === 'string' && v.length > 0 ? v : undefined;

  switch (bankType) {
    case 'CHARACTER': {
      const occupation = str(r.occupation);
      const temperament = str(r.temperament);
      const ageRange = str(r.ageRange);
      const socialClass = str(r.socialClass);
      const era = str(r.historicalEra);
      const bg = str(r.background) || '';

      const traits = [occupation, temperament, ageRange, socialClass, era].filter(Boolean).join(' · ');
      return {
        sourceItemTitle: str(r.name),
        sourceItemContent: `${bg ? `پیشینه: ${bg}\n\n` : ''}${traits ? `مشخصات: ${traits}` : ''}`,
        sourceItemHint: `راهنمای شخصیت‌پردازی و صحنه تصادم:
۱. خواسته اصلی (Desire): این شخصیت در این لحظه عمیقاً به دنبال چیست؟
۲. ترس / نقطه ضعف (Fear / Flaw): بزرگ‌ترین هراس یا مانع درونی او چیست؟
۳. صحنه تصادم (Clash): او را در موقعیتی قرار بده که برای رسیدن به خواسته‌اش، مجبور شود مستقیماً با ترس یا یک مانع بیرونی رودررو شود. صحنه این برخورد را با دیالوگ و کنش زنده بنویس.`,
      };
    }
    case 'PLACE': {
      const senses = Array.isArray(r.suggestedSenses)
        ? (r.suggestedSenses as string[])
        : [];
      return {
        sourceItemTitle: str(r.name),
        sourceItemContent: str(r.description),
        sourceItemHint: `راهنمای تصویرسازی حسی (نشان بده، نگو):
۱. فضا را از طریق اثرش بر حواس بنویس: نور و سایه‌ها، همهمه یا سکوت، بوهای مانده در هوا، سرمای زبر اشیاء.
۲. به جای گفتن «مکان ترسناک بود»، واکنش بدن شخصیت به آن فضا را نشان بده.${senses.length ? `\n۳. حواس پیشنهادی این مکان: ${senses.join('، ')}` : ''}`,
      };
    }
    case 'OPENING_LINE':
      return {
        sourceItemTitle: 'جمله‌ی آغازین داستان',
        sourceItemContent: str(r.text),
        sourceItemHint: `راهنمای ادامه دادن خط اول:
۱. ریتم را حفظ کن: بعد از این جمله نایست؛ بلافاصله یک کنش، نگاه یا پاسخ شکل بده.
۲. چه کسی در صحنه است؟ فوراً نشان بده گوینده یا شنونده این جمله کیست.
۳. تعلیق ایجاد کن: کاری کن خواننده بخواهد بداند جمله بعدی چیست.`,
      };
    case 'NEWS': {
      const sourceName = str(r.sourceName);
      const sourceUrl = str(r.sourceUrl);
      const fullText = str(r.fullText);
      const summary = str(r.summary) || '';
      const content = fullText ? `${summary}\n\nمتن کامل خبر:\n${fullText}` : summary;
      return {
        sourceItemTitle: str(r.title),
        sourceItemContent: content,
        sourceItemHint: `راهنمای تبدیل خبر به داستان:
۱. زاویه دید انتخاب کن: ماجرا را از دید یکی از آدم‌های گمنام حاضر در دل این خبر روایت کن.
۲. احساسات ناگفته: گزارش‌ها اخبار رسمی را می‌گویند؛ تو ترس‌ها، امیدها و زمزمه‌های انسانی پشت ماجرا را بنویس.
۳. فضاسازی زنده: ثانیه‌ای که این اتفاق رخ داد، هوا چه بویی می‌داد؟ چه صدایی بلند شد؟`,
        sourceName,
        sourceUrl,
      };
    }
    case 'STYLE_PARAGRAPH': {
      const byline = [str(r.author), str(r.work), str(r.year && `(${r.year})`)]
        .filter(Boolean)
        .join('، ');
      return {
        sourceItemTitle: byline || 'نمونه‌ی سبکی',
        sourceItemContent: str(r.originalText),
        sourceItemHint: str(r.styleFeature)
          ? `ویژگی سبکی که باید تقلید کنی: ${r.styleFeature}`
          : 'سبک و لحن این متن را در متنت بازتولید کن',
      };
    }
    case 'REFERENCE_STORY': {
      const byline = [str(r.author), str(r.year && `(${r.year})`)].filter(Boolean).join('، ');
      return {
        sourceItemTitle: str(r.title),
        sourceItemContent: str(r.text),
        sourceItemHint: byline
          ? `داستان مرجع${byline} — روی آن کار کن (بازنویسی / ادامه / دیدگاه دیگر)`
          : 'داستان مرجع — روی آن کار کن (بازنویسی / ادامه / دیدگاه دیگر)',
      };
    }
    case 'IMAGE':
      return {
        sourceItemTitle: str(r.topic) || 'تصویر',
        sourceItemContent: str(r.description),
        sourceItemHint: 'این تصویر را در ذهنت زنده کن و درباره‌اش بنویس',
      };
    case 'OBJECT':
      return {
        sourceItemTitle: str(r.name),
        sourceItemContent: str(r.description),
        sourceItemHint: undefined,
      };
    case 'EMOTION':
      return {
        sourceItemTitle: str(r.emotion),
        sourceItemContent: str(r.showSample),
        sourceItemHint: str(r.emotion)
          ? `این حس را نشان بده، نه بگو (کلمه‌ی «${r.emotion}» را در متن نیاور)`
          : undefined,
      };
    case 'WHAT_IF':
      return {
        sourceItemTitle: 'اگر … چه؟',
        sourceItemContent: str(r.question),
        sourceItemHint: undefined,
      };
    case 'STRUCTURE_PHRASE':
      return {
        sourceItemTitle: 'عبارت ساختاری',
        sourceItemContent: str(r.text),
        sourceItemHint: undefined,
      };
    case 'WORD':
      return {
        sourceItemTitle: 'کلمه',
        sourceItemContent: str(r.text),
        sourceItemHint: 'یک نوشتار بنویس که حول این کلمه بچرخد',
      };
    case 'CUTUP_TEXT':
      return {
        sourceItemTitle: 'متن بریده',
        sourceItemContent: str(r.text),
        sourceItemHint: 'این متن را به قطعه‌های کوچک بشکن و به ترتیبی جدید بازنویس کن',
      };
    default:
      return {};
  }
}

/** Wrap exerciseType + sourceItem + normalized fields into the snapshot shape. */
export function buildPromptSnapshot(
  exercise: Record<string, unknown>,
  bankType: BankType | null,
  item: unknown,
): {
  exerciseType: Record<string, unknown>;
  sourceItem: unknown;
  sourceItemTitle?: string;
  sourceItemContent?: string;
  sourceItemHint?: string;
} {
  return {
    exerciseType: {
      slug: exercise.slug,
      title: exercise.title,
      category: exercise.category,
      durationSeconds: exercise.durationSeconds,
      wordTargetMin: exercise.wordTargetMin,
      wordTargetMax: exercise.wordTargetMax,
      description: exercise.description,
    },
    sourceItem: item,
    ...promptFieldsForItem(bankType, item),
  };
}

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly selector: SelectorService,
    private readonly integrity: IntegrityService,
    private readonly xp: XpService,
    private readonly streak: StreakService,
    private readonly exerciseValidator: ExerciseValidator,
    private readonly quests: QuestService,
    private readonly series: SeriesService,
    private readonly staircase: StaircaseService,
  ) {}

  // ------------------------------------------------------------------
  // Sessions
  // ------------------------------------------------------------------

  /**
   * E.2 createSession:
   *  1. accessLevel <= user.role
   *  2. bank draw (Selector) when bankSourceType != null — step 7
   *  3. series check (step 7+)
   *  4. Session.create IN_PROGRESS
   *  5. EventLog session_started
   *  6. return { session, promptSnapshot }
   */
  async create(userId: string, userRole: UserRole, dto: CreateSessionDto) {
    const exercise = await this.prisma.exerciseType.findUnique({
      where: { id: dto.exerciseTypeId },
    });
    if (!exercise || !exercise.isActive) {
      throw new NotFoundException('EXERCISE_NOT_FOUND');
    }
    if (!canAccess(userRole, exercise.accessLevel)) {
      // SPEC E.2 step 1: role must be >= exercise accessLevel.
      throw new ForbiddenException('EXERCISE_ACCESS_DENIED');
    }

    // DECISION (spec E.2 step 3): series check on creation.
    // SENSES / PERSPECTIVE are auto-initialised lazily by SeriesService.list()
    // (idempotent), so for a series-driven slug we ensure the active series
    // exists. MORNING_PAGES / WORD_GOAL are started explicitly by the user via
    // /series/start, so we do NOT auto-create them here — only SENSES and
    // PERSPECTIVE (the two auto-init types) get a best-effort check.
    if (exercise.slug === 'five-senses' || exercise.slug === 'perspectives') {
      const seriesType = exercise.slug === 'five-senses' ? 'SENSES' : 'PERSPECTIVE';
      try {
        const existing = await this.prisma.exerciseSeries.findFirst({
          where: { userId, seriesType: seriesType as any, status: 'ACTIVE' as any },
        });
        if (!existing) {
          await this.prisma.exerciseSeries.create({
            data: {
              userId,
              seriesType: seriesType as any,
              remainingJson:
                seriesType === 'SENSES'
                  ? ['بینا', 'شنوا', 'بویا', 'چشایی', 'لمس'].map((k) => ({ key: k, label: k, done: false }))
                  : Array.from({ length: 3 }, (_, i) => ({ key: `view-${i + 1}`, label: `دیدگاه ${i + 1}`, done: false })),
              doneJson: [],
            },
          });
        }
      } catch {
        // Best-effort: a series init failure must not block session creation.
      }
    }

    // DECISION: server-side Selector draw (step 7, spec E.2 step 2) when the
    // exercise declares a bankSourceType. If client explicitly passed a selected
    // sourceItem (e.g. from the Bank page), honor that exact item so the writer
    // practices with the item they picked. Otherwise draw randomly.
    let sourceItemId: string | null = null;
    let sourceItemType: BankType | null = null;
    let sourceItem: unknown = null;

    if (dto.sourceItemId && (dto.sourceItemType || exercise.bankSourceType)) {
      const targetBank = (dto.sourceItemType || exercise.bankSourceType) as BankType;
      try {
        const item = await fetchItem(this.prisma, targetBank, dto.sourceItemId);
        sourceItemId = item.id;
        sourceItemType = targetBank;
        sourceItem = item;
      } catch {
        // Fallback to random draw if item fetch fails
      }
    }

    if (!sourceItem && exercise.bankSourceType != null) {
      const out = await this.selector.draw(
        userId,
        exercise.bankSourceType,
        exercise.slug,
      );
      sourceItemId = out.item.id;
      sourceItemType = exercise.bankSourceType;
      sourceItem = out.item;
    } else if (!sourceItem && dto.sourceItemId && dto.sourceItemType) {
      sourceItemId = dto.sourceItemId;
      sourceItemType = dto.sourceItemType;
    }

    const promptSnapshot = buildPromptSnapshot(
      exercise,
      sourceItemType,
      sourceItem,
    );

    const session = await this.prisma.exerciseSession.create({
      data: {
        userId,
        exerciseTypeId: exercise.id,
        status: SessionStatus.IN_PROGRESS,
        sourceItemId,
        sourceItemType,
        promptSnapshotJson: promptSnapshot as Prisma.InputJsonValue,
      },
    });

    await this.events.logRaw(userId, 'session_started', {
      sessionId: session.id,
      exerciseType: exercise.slug,
    }, { sessionType: 'practice', sessionId: session.id });

    return { session, promptSnapshot };
  }

  /** Owner or ADMIN may read a session. */
  async getById(sessionId: string, userId: string, userRole: UserRole) {
    const session = await this.prisma.exerciseSession.findUnique({
      where: { id: sessionId },
      include: {
        exerciseType: true,
        drafts: { orderBy: { versionNumber: 'asc' } },
        submission: true,
      },
    });
    if (!session) throw new NotFoundException('SESSION_NOT_FOUND');
    if (session.userId !== userId && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('SESSION_FORBIDDEN');
    }
    return session;
  }

  /** GET /sessions/active — the user's in-flight sessions. */
  async listActive(userId: string) {
    return this.prisma.exerciseSession.findMany({
      where: { userId, status: SessionStatus.IN_PROGRESS },
      include: { exerciseType: true },
      orderBy: { startedAt: 'desc' },
    });
  }

  /** GET /sessions — owner's sessions, optionally filtered. */
  async listMine(userId: string, query: ListSessionsQuery) {
    const where: Prisma.ExerciseSessionWhereInput = { userId, deletedAt: null };
    if (query.status) where.status = query.status;
    if (query.from || query.to) {
      where.startedAt = {};
      if (query.from) where.startedAt.gte = new Date(query.from);
      if (query.to) where.startedAt.lte = new Date(query.to);
    }
    const sessions = await this.prisma.exerciseSession.findMany({
      where,
      include: {
        exerciseType: true,
        submission: true,
        drafts: { orderBy: { versionNumber: 'desc' }, take: 1 },
      },
      orderBy: { startedAt: 'desc' },
      take: 200,
    });

    return sessions.map((s) => {
      const latestDraft = s.drafts?.[0];
      return {
        ...s,
        wordCount: s.submission?.wordCount ?? latestDraft?.wordCount ?? 0,
      };
    });
  }

  /** POST /sessions/:id/abandon — owner only, idempotent-ish. */
  async abandon(sessionId: string, userId: string) {
    const session = await this.prisma.exerciseSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('SESSION_NOT_FOUND');
    if (session.userId !== userId) throw new ForbiddenException('SESSION_FORBIDDEN');
    if (session.status === SessionStatus.SUBMITTED) {
      // DECISION: a submitted session cannot be abandoned — it already
      // produced a Submission + integrity + XP record.
      throw new BadRequestException('SESSION_ALREADY_SUBMITTED');
    }
    const updated = await this.prisma.exerciseSession.update({
      where: { id: sessionId },
      data: { status: SessionStatus.ABANDONED, endedAt: new Date() },
    });
    await this.events.logRaw(userId, 'session_abandoned', {
      sessionId,
    }, { sessionType: 'practice', sessionId });
    return updated;
  }

  /** DELETE /sessions/:id — soft delete (30-day trash). */
  async delete(sessionId: string, userId: string) {
    const session = await this.ensureOwnedSession(sessionId, userId);
    if (session.deletedAt) {
      throw new BadRequestException('SESSION_ALREADY_DELETED');
    }

    await this.prisma.exerciseSession.update({
      where: { id: sessionId },
      data: { deletedAt: new Date() },
    });

    await this.events.logRaw(userId, 'session_deleted', {
      sessionId,
      exerciseTypeId: session.exerciseTypeId,
    }, { sessionType: 'practice', sessionId });

    return { ok: true };
  }

  /** POST /sessions/:id/restore — restore a soft-deleted session. */
  async restore(sessionId: string, userId: string) {
    const session = await this.ensureOwnedSession(sessionId, userId);
    if (!session.deletedAt) {
      throw new BadRequestException('SESSION_NOT_IN_TRASH');
    }

    const restored = await this.prisma.exerciseSession.update({
      where: { id: sessionId },
      data: { deletedAt: null },
    });

    await this.events.logRaw(userId, 'session_restored', {
      sessionId,
    }, { sessionType: 'practice', sessionId });
    return restored;
  }

  // ------------------------------------------------------------------
  // Reroll (step 7, spec K.2 "Reroll limit")
  // ------------------------------------------------------------------

  /**
   * POST /sessions/:id/reroll — re-draw the bank source item for an
   * in-progress, bank-driven session.
   *
   * Rules:
   *  - only IN_PROGRESS sessions
   *  - only sessions that have a bankSourceType (sourceItemType != null)
   *  - capped at REROLL_PER_SESSION_LIMIT (2) per session (spec line 2660)
   *  - excludes the current sourceItemId so the new draw is different
   */
  async reroll(sessionId: string, userId: string) {
    const session = await this.ensureOwnedSession(sessionId, userId);
    if (session.status !== SessionStatus.IN_PROGRESS) {
      throw new BadRequestException('SESSION_NOT_IN_PROGRESS');
    }
    if (!session.sourceItemType) {
      throw new BadRequestException('SESSION_HAS_NO_BANK');
    }
    if (session.rerollCount >= REROLL_PER_SESSION_LIMIT) {
      // DECISION: spec lists REROLL_LIMIT_REACHED as a 429 (line 1671).
      throw new HttpException('REROLL_LIMIT_REACHED', 429);
    }

    // Phase 2: reroll does not carry field-level filters yet (ExerciseType
    // has no filter-preference schema column). The weighted/conditional
    // selectors still apply recency+novelty weighting to the full pool.
    const out = await this.selector.draw(
      userId,
      session.sourceItemType,
      undefined, // exerciseSlug — inert for reroll
      sessionId,
    );

    const updated = await this.prisma.exerciseSession.update({
      where: { id: sessionId },
      data: {
        sourceItemId: out.item.id,
        sourceItemType: session.sourceItemType,
        // Re-write the prompt snapshot with the new source item.
        promptSnapshotJson: this.buildRerollSnapshot(
          session,
          out.item,
        ) as Prisma.InputJsonValue,
        rerollCount: session.rerollCount + 1,
      },
    });

    await this.events.logRaw(userId, 'session_rerolled', {
      sessionId,
      rerollCount: updated.rerollCount,
      newSourceItemId: out.item.id,
    }, { sessionType: 'practice', sessionId });

    return {
      session: updated,
      sourceItem: out.item,
      selectionLogId: out.selectionLogId,
    };
  }

  /**
   * Rebuild the prompt snapshot JSON for a rerolled session, preserving the
   * original exerciseType block and swapping in the new source item.
   */
  private buildRerollSnapshot(
    session: { promptSnapshotJson: Prisma.JsonValue; sourceItemType: BankType | null },
    newItem: unknown,
  ) {
    const prev = (session.promptSnapshotJson ?? {}) as {
      exerciseType?: Record<string, unknown>;
    };
    return {
      ...prev,
      sourceItem: newItem,
      // The exerciseType block was normalized in create(); reuse it and only
      // refresh the source-item fields for the freshly drawn item.
      ...promptFieldsForItem(session.sourceItemType, newItem),
    };
  }

  // ------------------------------------------------------------------
  // Drafts
  // ------------------------------------------------------------------

  /**
   * D.5: versionNumber = max + 1. If content identical to the latest
   * version, skip (return the existing version, no new row).
   */
  async saveDraft(sessionId: string, userId: string, dto: SaveDraftDto) {
    const session = await this.ensureOwnedSession(sessionId, userId);

    const latest = await this.prisma.draft.findFirst({
      where: { sessionId },
      orderBy: { versionNumber: 'desc' },
    });

    // DECISION: identical-to-latest => skip (spec D.5). Returning the latest
    // row signals "no new version was created" without an error.
    if (latest && latest.contentText === dto.contentText) {
      return { draft: latest, skipped: true };
    }

    const versionNumber = (latest?.versionNumber ?? 0) + 1;
    const draft = await this.prisma.draft.create({
      data: {
        sessionId,
        userId,
        contentText: dto.contentText,
        wordCount: countWords(dto.contentText),
        versionNumber,
        saveTrigger: dto.saveTrigger ?? DraftSaveTrigger.AUTO,
      },
    });
    return { draft, skipped: false };
  }

  /** GET /sessions/:id/drafts — all versions, ascending. */
  async listDrafts(sessionId: string, userId: string) {
    await this.ensureOwnedSession(sessionId, userId);
    return this.prisma.draft.findMany({
      where: { sessionId },
      orderBy: { versionNumber: 'asc' },
      select: {
        id: true,
        versionNumber: true,
        wordCount: true,
        saveTrigger: true,
        createdAt: true,
      },
    });
  }

  /** GET /sessions/:id/drafts/:version — single version with content. */
  async getDraft(sessionId: string, userId: string, version: number) {
    await this.ensureOwnedSession(sessionId, userId);
    const draft = await this.prisma.draft.findUnique({
      where: { sessionId_versionNumber: { sessionId, versionNumber: version } },
    });
    if (!draft) throw new NotFoundException('DRAFT_NOT_FOUND');
    return draft;
  }

  // ------------------------------------------------------------------
  // Submit
  // ------------------------------------------------------------------

  /**
   * E.2 submitSession:
   *  1. ownership + status != SUBMITTED
   *  2. soft warning if wordCount < targetMin × 0.5
   *  3. IntegrityCheck.run(submission) — step 8
   *  4. XP award — step 9
   *  5. EventLog exercise_submitted
   *  6. queue badge-evaluate, recommendation-refresh, analytics-aggregate
   *  7. return { submission, integrityChecks, xpResult, newBadges: [] }
   */
  async submit(sessionId: string, userId: string, dto: SubmitSessionDto) {
    const session = await this.ensureOwnedSession(sessionId, userId);
    if (session.status === SessionStatus.SUBMITTED) {
      throw new BadRequestException('SESSION_ALREADY_SUBMITTED');
    }

    // DECISION: server recomputes wordCount from contentText — client stats
    // are auxiliary (used by Integrity in step 8), never the source of truth.
    const wordCount = countWords(dto.contentText);
    const exercise = await this.prisma.exerciseType.findUniqueOrThrow({
      where: { id: session.exerciseTypeId },
    });

    // E.2 step 2: soft warning when well under target.
    const belowTarget = wordCount < exercise.wordTargetMin * 0.5;

    // Per-exercise constraint check (spec E.2 "constraintCheck"): runs the
    // exercise's rubric-driven constraint (lipogram / n7 / clustering /
    // structure / style) against the submitted text. Exercises without a
    // rubric.check (the legacy phase-1 set) come back SKIPPED and the
    // stored shape is unchanged. Never blocks a submission.
    const constraintCheck = await this.exerciseValidator.validate(exercise, dto.contentText);

    // DECISION: the latest draft is the submission's finalDraft. If the user
    // submits without having saved a draft, we persist the submitted text as
    // a SUBMIT-triggered draft first so the finalDraft reference is valid.
    let finalDraft = await this.prisma.draft.findFirst({
      where: { sessionId },
      orderBy: { versionNumber: 'desc' },
    });
    if (!finalDraft) {
      finalDraft = await this.prisma.draft.create({
        data: {
          sessionId,
          userId,
          contentText: dto.contentText,
          wordCount,
          versionNumber: 1,
          saveTrigger: DraftSaveTrigger.SUBMIT,
        },
      });
    }

    // Step 8 (spec E.4): create the submission with an initial PASSED, then
    // run the integrity pipeline which overwrites the aggregate with the
    // real result and persists the per-check rows.
    const submission = await this.prisma.submission.create({
      data: {
        sessionId,
        userId,
        finalDraftId: finalDraft.id,
        wordCount,
        durationSeconds: dto.clientStats?.durationSeconds ?? 0,
        pausesCount: dto.clientStats?.pauses?.length ?? 0,
        deletionCount: dto.clientStats?.deletionCount ?? 0,
        integrityResult: IntegrityResult.PASSED,
        xpAwarded: 0,
        xpPending: false,
        constraintCheckJson: ({
          ...(belowTarget ? { wordCount, targetMin: exercise.wordTargetMin, belowTarget } : {}),
          ...(constraintCheck.skipped ? {} : { exercise: constraintCheck }),
        }) as Prisma.InputJsonValue,
      },
    });
    const integrityChecks = await this.integrity.run({
      submission,
      contentText: dto.contentText,
      clientStats: dto.clientStats,
    });
    // Re-read so the response carries the updated integrityResult.
    const finalized = await this.prisma.submission.findUnique({
      where: { id: submission.id },
    })!;

    await this.prisma.exerciseSession.update({
      where: { id: sessionId },
      data: { status: SessionStatus.SUBMITTED, endedAt: new Date() },
    });

    // Step 9 (spec E.5): award XP with the finalized integrityResult, then
    // record it on the submission row.
    const xpResult: XpResult = await this.xp.awardForSubmission(finalized, wordCount);
    await this.prisma.submission.update({
      where: { id: finalized.id },
      data: { xpAwarded: xpResult.finalXp },
    });

    // Step 9 (spec E.6): extend the streak for a qualifying submission.
    await this.streak.onSubmitted(userId, wordCount);

    // DECISION: the payload carries the exercise id (not only the slug) so
    // the XP novelty/diminishing queries (E.5) can count prior submissions
    // of the same exercise via eventPayloadJson.exerciseTypeId.
    await this.events.logRaw(userId, 'exercise_submitted', {
      sessionId,
      wordCount,
      exerciseType: exercise.slug,
      exerciseTypeId: exercise.id,
      belowTarget,
      xpAwarded: xpResult.finalXp,
    }, { sessionType: 'practice', sessionId });

    // I.10 one-variety quest: the current submission's category is the one
    // the user submits least often (across all exercise_submitted events,
    // counting this submission). Fire-and-forget — quest hiccups never
    // break the submit response.
    try {
      await this.trackOneVariety(userId, exercise);
    } catch (err) {
      // DECISION: logged-and-swallowed, same policy as the streak/quest hooks.
      console.error('[sessions] one-variety quest tracking failed', err);
    }

    // Phase 2 — series progression. Fire-and-forget: series hiccups never
    // block the submit response. Tracks SENSES, PERSPECTIVE, MORNING_PAGES,
    // and WORD_GOAL in a single call (each is a no-op if the slug/wordCount
    // doesn't match that series type).
    try {
      await this.series.track(userId, 'SENSES', { slug: exercise.slug });
      await this.series.track(userId, 'PERSPECTIVE', { slug: exercise.slug });
      await this.series.track(userId, 'MORNING_PAGES', { slug: exercise.slug });
      await this.series.track(userId, 'WORD_GOAL', { slug: exercise.slug, wordCount });
    } catch (err) {
      // DECISION: logged-and-swallowed, same policy as the streak/quest hooks.
      console.error('[sessions] series tracking failed', err);
    }

    // Phase 2 — word-target staircase. Fire-and-forget: staircase hiccups
    // never block the submit response.
    try {
      await this.staircase.track(userId, wordCount);
    } catch (err) {
      console.error('[sessions] staircase tracking failed', err);
    }

    return {
      submission: { ...finalized, xpAwarded: xpResult.finalXp },
      integrityChecks,
      xpResult,
      newBadges: [], // step 10
      warning: belowTarget
        ? `WORD_COUNT_BELOW_TARGET:${wordCount}/${exercise.wordTargetMin}`
        : null,
    };
  }

  // ------------------------------------------------------------------
  // helpers
  // ------------------------------------------------------------------

  private async ensureOwnedSession(sessionId: string, userId: string) {
    const session = await this.prisma.exerciseSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('SESSION_NOT_FOUND');
    if (session.userId !== userId) throw new ForbiddenException('SESSION_FORBIDDEN');
    return session;
  }

  /**
   * I.10 "daily.one-variety": reward submitting an exercise from the
   * category the user submits least often.
   *
   * DECISION (operational definition, see plan): "category" = exerciseType
   * slug; counts come from the user's exercise_submitted events (which the
   * logRaw above just wrote, so the current submission is included). If the
   * current slug ties for the minimum, today's variety quest is fulfilled.
   */
  private async trackOneVariety(
    userId: string,
    exercise: { slug: string },
  ): Promise<void> {
    // DECISION: groupBy on the Json column would return opaque bucket keys —
    // read the events and count the slugs in JS instead (per-user event
    // volume is small; the event above is already persisted).
    const events = await this.prisma.eventLog.findMany({
      where: { userId, eventName: 'exercise_submitted' },
      select: { eventPayloadJson: true },
    });

    const byCategory = new Map<string, number>();
    for (const { eventPayloadJson } of events) {
      const slug = (eventPayloadJson as Record<string, unknown>)?.exerciseType;
      if (typeof slug === 'string' && slug.length > 0) {
        byCategory.set(slug, (byCategory.get(slug) ?? 0) + 1);
      }
    }

    const currentCount = byCategory.get(exercise.slug) ?? 0;
    // First-ever submission: only one category exists — variety by default.
    if (byCategory.size <= 1) {
      await this.quests.recordProgress(userId, 'daily.one-variety');
      return;
    }
    const minCount = Math.min(...byCategory.values());
    if (currentCount === minCount) {
      await this.quests.recordProgress(userId, 'daily.one-variety');
    }
  }
}
