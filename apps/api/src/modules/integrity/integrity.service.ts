import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IntegrityCheck,
  IntegrityCheckType,
  IntegrityResult,
  Prisma,
  Submission,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientStatsDto } from '../sessions/dto/submit-session.dto';
import { NlpService } from './nlp.service';

export interface IntegrityRunInput {
  submission: Submission;
  contentText: string;
  clientStats?: ClientStatsDto;
}

/**
 * Spec E.4 — the integrity pipeline runs synchronously inside the submit
 * flow (short-circuit order): each check is evaluated in the listed order;
 * the aggregate is FLAGGED if any check is FLAGGED, else WARNING if any is
 * WARNING, else PASSED. The result is written back onto the Submission row
 * and each check is persisted as an IntegrityCheck row.
 */
@Injectable()
export class IntegrityService {
  private readonly logger = new Logger(IntegrityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly nlp: NlpService,
    config: ConfigService,
  ) {
    this.pasteThreshold = num(config.get('PASTE_THRESHOLD'), 0.2);
    this.typingSpeedMax = num(config.get('TYPING_SPEED_MAX'), 12);
    this.vocabUniqueMin = num(config.get('VOCAB_UNIQUE_MIN'), 0.3);
    this.knownWordMin = num(config.get('KNOWN_WORD_MIN'), 0.6);
    this.selfSimilarityMax = num(config.get('SELF_SIMILARITY_MAX'), 0.9);
    this.bankSimilarityMax = num(config.get('BANK_SIMILARITY_MAX'), 0.8);
    this.persianCharMin = num(config.get('PERSIAN_CHAR_MIN'), 0.7);
  }

  private pasteThreshold: number;
  private typingSpeedMax: number;
  private vocabUniqueMin: number;
  private knownWordMin: number;
  private selfSimilarityMax: number;
  private bankSimilarityMax: number;
  private persianCharMin: number;

  /**
   * Run all seven checks, persist IntegrityCheck rows, and update the
   * Submission.integrityResult aggregate. Returns the run's checks (with the
   * aggregate result) so the submit flow can include them in its response.
   */
  async run(input: IntegrityRunInput): Promise<IntegrityCheck[]> {
    const checks = await this.evaluate(input);
    const aggregate = checks.reduce<IntegrityResult>(
      (worst, c) => (c.result === 'FLAGGED' ? 'FLAGGED' : worst === 'PASSED' && c.result === 'WARNING' ? 'WARNING' : worst),
      'PASSED',
    );

    const rows = await this.prisma.integrityCheck.createMany({
      data: checks.map((c) => ({
        submissionId: input.submission.id,
        checkType: c.checkType,
        result: c.result,
        detailsJson: c.details as Prisma.InputJsonValue,
      })),
    });

    await this.prisma.submission.update({
      where: { id: input.submission.id },
      data: { integrityResult: aggregate },
    });

    // createMany does not return the rows; re-select so the caller gets the
    // persisted ids (they are part of the submit response payload).
    const persisted = await this.prisma.integrityCheck.findMany({
      where: { submissionId: input.submission.id },
      orderBy: { createdAt: 'asc' },
    });
    void rows;
    return persisted;
  }

  /** Evaluate the seven checks in spec order (E.4 short-circuit list). */
  private async evaluate(input: IntegrityRunInput): Promise<
    { checkType: IntegrityCheckType; result: IntegrityResult; details: Record<string, unknown> }[]
  > {
    const { submission, contentText, clientStats } = input;
    const out: { checkType: IntegrityCheckType; result: IntegrityResult; details: Record<string, unknown> }[] = [];

    // 1. PASTE — pasteCharCount / contentLength > threshold → FLAGGED
    const contentLength = contentText.length;
    const pasteCharCount = clientStats?.pasteCharCount;
    const pasteRatio =
      typeof pasteCharCount === 'number' && contentLength > 0
        ? pasteCharCount / contentLength
        : 0;
    out.push({
      checkType: 'PASTE',
      result:
        pasteCharCount !== undefined && pasteRatio > this.pasteThreshold
          ? 'FLAGGED'
          : 'PASSED',
      details: {
        pasteCharCount: pasteCharCount ?? null,
        contentLength,
        pasteRatio: round(pasteRatio),
        threshold: this.pasteThreshold,
        nlpAvailable: null, // not an NLP check
      },
    });

    // 2. TYPING_SPEED — totalKeystrokes / activeTimeSeconds > max → WARNING
    const totalKeystrokes = clientStats?.totalKeystrokes;
    const activeTimeSeconds = clientStats?.activeTimeSeconds;
    const typingSpeed =
      typeof totalKeystrokes === 'number' &&
      typeof activeTimeSeconds === 'number' &&
      activeTimeSeconds > 0
        ? totalKeystrokes / activeTimeSeconds
        : 0;
    out.push({
      checkType: 'TYPING_SPEED',
      result:
        totalKeystrokes !== undefined &&
        activeTimeSeconds !== undefined &&
        typingSpeed > this.typingSpeedMax
          ? 'WARNING'
          : 'PASSED',
      details: {
        totalKeystrokes: totalKeystrokes ?? null,
        activeTimeSeconds: activeTimeSeconds ?? null,
        typingSpeed: round(typingSpeed),
        max: this.typingSpeedMax,
      },
    });

    // 3. ACTIVE_TIME — activeTimeSeconds < wordCount / 150 * 60 → WARNING
    // DECISION: only evaluated when the client reported activeTimeSeconds;
    // a missing signal cannot be disproven, so it passes (consistent with
    // rule 2's defensive handling).
    const minActiveSeconds = (submission.wordCount / 150) * 60;
    out.push({
      checkType: 'ACTIVE_TIME',
      result:
        activeTimeSeconds !== undefined && activeTimeSeconds < minActiveSeconds
          ? 'WARNING'
          : 'PASSED',
      details: {
        activeTimeSeconds: activeTimeSeconds ?? null,
        wordCount: submission.wordCount,
        minActiveSeconds: round(minActiveSeconds),
      },
    });

    // 4. LANGUAGE — Persian character ratio < 0.70 → WARNING
    const persianRatio = persianCharRatio(contentText);
    out.push({
      checkType: 'LANGUAGE',
      result: persianRatio < this.persianCharMin ? 'WARNING' : 'PASSED',
      details: { persianRatio: round(persianRatio), min: this.persianCharMin },
    });

    // 5. VOCABULARY — uniqueRatio < 0.30 یا knownWordRatio < 0.60 → WARNING
    // DECISION: vocabulary-stats needs the NLP service (hazm/parsivar).
    // If it is unreachable, the check degrades to PASSED with a marker —
    // a down NLP service must never flag a writer.
    const nlpAvailable = await this.nlp.isAvailable();
    const vocab = nlpAvailable ? await this.nlp.vocabularyStats(contentText) : null;
    out.push({
      checkType: 'VOCABULARY',
      result:
        vocab &&
        (vocab.uniqueRatio > 0 && vocab.uniqueRatio < this.vocabUniqueMin ||
          (vocab.knownWordRatio > 0 && vocab.knownWordRatio < this.knownWordMin))
          ? 'WARNING'
          : 'PASSED',
      details: {
        nlpAvailable,
        ...(vocab
          ? {
              uniqueRatio: vocab.uniqueRatio,
              knownWordRatio: vocab.knownWordRatio,
              uniqueWords: vocab.uniqueWords,
              totalWords: vocab.totalWords,
            }
          : {}),
        uniqueMin: this.vocabUniqueMin,
        knownMin: this.knownWordMin,
      },
    });

    // 6. SELF_REPEAT — cosine with last 5 submissions > 0.90 → FLAGGED
    const selfRepeat = await this.selfRepeatCheck(input, nlpAvailable);
    out.push(selfRepeat);

    // 7. SIMILARITY_BANK — cosine with the session's source item > 0.80 → FLAGGED
    const bankSim = await this.bankSimilarityCheck(input, nlpAvailable);
    out.push(bankSim);

    return out;
  }

  /** Rule 6: compare against the user's last 5 prior submissions. */
  private async selfRepeatCheck(
    input: IntegrityRunInput,
    nlpAvailable: boolean,
  ): Promise<{ checkType: IntegrityCheckType; result: IntegrityResult; details: Record<string, unknown> }> {
    const base = { nlpAvailable };
    if (!nlpAvailable) {
      return { checkType: 'SELF_REPEAT', result: 'PASSED', details: { ...base, skipped: 'nlp_unavailable' } };
    }
    // DECISION: read the content from prior submissions' final drafts —
    // the drafts are the source of truth for submitted text.
    const priors = await this.prisma.submission.findMany({
      where: {
        userId: input.submission.userId,
        id: { not: input.submission.id },
      },
      orderBy: { submittedAt: 'desc' },
      take: 5,
      select: { id: true, finalDraftId: true },
    });
    if (priors.length === 0) {
      return { checkType: 'SELF_REPEAT', result: 'PASSED', details: { ...base, comparedCount: 0 } };
    }
    const drafts = await this.prisma.draft.findMany({
      where: { id: { in: priors.map((p) => p.finalDraftId) } },
      select: { id: true, contentText: true },
    });
    let maxSimilarity = 0;
    let comparedCount = 0;
    for (const draft of drafts) {
      const sim = await this.nlp.cosineSimilarity(input.contentText, draft.contentText);
      if (sim === null) continue;
      comparedCount += 1;
      maxSimilarity = Math.max(maxSimilarity, sim);
    }
    if (comparedCount === 0) {
      // NLP up for health but /similarity down — degrade, do not flag.
      return { checkType: 'SELF_REPEAT', result: 'PASSED', details: { ...base, comparedCount: 0, skipped: 'similarity_unavailable' } };
    }
    return {
      checkType: 'SELF_REPEAT',
      result: maxSimilarity > this.selfSimilarityMax ? 'FLAGGED' : 'PASSED',
      details: { ...base, maxSimilarity: round(maxSimilarity), comparedCount, max: this.selfSimilarityMax },
    };
  }

  /** Rule 7: compare against the session's source bank item text. */
  private async bankSimilarityCheck(
    input: IntegrityRunInput,
    nlpAvailable: boolean,
  ): Promise<{ checkType: IntegrityCheckType; result: IntegrityResult; details: Record<string, unknown> }> {
    const base = { nlpAvailable };
    if (!nlpAvailable) {
      return { checkType: 'SIMILARITY_BANK', result: 'PASSED', details: { ...base, skipped: 'nlp_unavailable' } };
    }
    const session = await this.prisma.exerciseSession.findUnique({
      where: { id: input.submission.sessionId },
      select: { sourceItemId: true, sourceItemType: true },
    });
    if (!session?.sourceItemId || !session.sourceItemType) {
      return { checkType: 'SIMILARITY_BANK', result: 'PASSED', details: { ...base, skipped: 'no_source_item' } };
    }
    const text = await fetchBankItemText(this.prisma, session.sourceItemType, session.sourceItemId);
    if (!text) {
      // The bank item is gone or has no comparable text — pass rather than flag.
      return { checkType: 'SIMILARITY_BANK', result: 'PASSED', details: { ...base, skipped: 'no_item_text' } };
    }
    const sim = await this.nlp.cosineSimilarity(input.contentText, text);
    if (sim === null) {
      return { checkType: 'SIMILARITY_BANK', result: 'PASSED', details: { ...base, skipped: 'similarity_unavailable' } };
    }
    return {
      checkType: 'SIMILARITY_BANK',
      result: sim > this.bankSimilarityMax ? 'FLAGGED' : 'PASSED',
      details: { ...base, similarity: round(sim), max: this.bankSimilarityMax },
    };
  }
}

/** Text column per bank model (used only by the SIMILARITY_BANK check). */
const BANK_TEXT_COLUMN: Partial<Record<string, string>> = {
  CHARACTER: 'name',
  PLACE: 'name',
  OPENING_LINE: 'text',
  STYLE_PARAGRAPH: 'text',
  REFERENCE_STORY: 'text',
  NEWS: 'headline',
  IMAGE: 'description',
  OBJECT: 'name',
  EMOTION: 'word',
  WHAT_IF: 'question',
  STRUCTURE_PHRASE: 'text',
  WORD: 'word',
  CUTUP_TEXT: 'text',
};

async function fetchBankItemText(
  prisma: PrismaService,
  bankType: string,
  id: string,
): Promise<string | null> {
  const key = BANK_ITEM_KEY[bankType];
  const column = BANK_TEXT_COLUMN[bankType];
  if (!key || !column) return null;
  try {
    const delegate = (prisma as unknown as Record<string, {
      findUnique: (args: { where: { id: string }; select: Record<string, boolean> }) => Promise<Record<string, unknown> | null>;
    }>)[key];
    const row = await delegate.findUnique({ where: { id }, select: { [column]: true } });
    const value = row?.[column];
    return typeof value === 'string' && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

const BANK_ITEM_KEY: Partial<Record<string, string>> = {
  CHARACTER: 'character',
  PLACE: 'place',
  OPENING_LINE: 'openingLine',
  STYLE_PARAGRAPH: 'styleParagraph',
  REFERENCE_STORY: 'referenceStory',
  NEWS: 'newsItem',
  IMAGE: 'imageAsset',
  OBJECT: 'objectItem',
  EMOTION: 'emotionLexicon',
  WHAT_IF: 'whatIfQuestion',
  STRUCTURE_PHRASE: 'structurePhrase',
  WORD: 'word',
  CUTUP_TEXT: 'cutupText',
};

function num(v: unknown, fallback: number): number {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

function round(n: number, digits = 4): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/**
 * Persian-character ratio: characters in the Persian Unicode block over all
 * non-whitespace characters. Used by the LANGUAGE check (E.4 rule 4).
 */
export function persianCharRatio(text: string): number {
  let persian = 0;
  let total = 0;
  for (const ch of text) {
    if (/\s/.test(ch)) continue;
    total += 1;
    const c = ch.codePointAt(0) ?? 0;
    // Persian (0600–06FF), Extended-A (0750–077F), presentation forms,
    // and the Arabic letter range that Persian uses.
    if (
      (c >= 0x0600 && c <= 0x06ff) ||
      (c >= 0x0750 && c <= 0x077f) ||
      c === 0x0640 || // Persian Yeh
      c === 0x067e || // Persian Kaf
      c === 0x0686 || // Persian Gaf
      c === 0x06a9 // Persian Tche
    ) {
      persian += 1;
    }
  }
  return total === 0 ? 1 : persian / total;
}
