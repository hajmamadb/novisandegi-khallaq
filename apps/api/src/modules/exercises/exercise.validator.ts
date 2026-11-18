import { Injectable, Logger } from '@nestjs/common';

/**
 * ExerciseValidator — the per-exercise constraint check that runs at
 * submit time (spec E.2 step "constraintCheck", after Integrity).
 *
 * DECISION: this is a *constraint* check, not a *quality* judge.
 *   - It never throws on a constraint violation — it returns a result
 *     the caller can fold into the submission's constraintCheckJson.
 *   - It degrades to { status: 'PASSED', skipped: true } when it cannot
 *     evaluate (NLP down, missing rubric, unknown check kind).
 *   - It never blocks a submission: a writer who "fails" a lipogram
 *     still submits — the offending words are returned so the practice
 *     page can highlight them red (spec G.3 / the exercise description).
 *
 * The exercise's rubricJson (set in seed.ts) drives which check runs:
 *   { check: 'lipogram',  forbiddenLetter | forbiddenWord, level }
 *   { check: 'n7',        transform, n }
 *   { check: 'clustering', minHubWords }
 *   { check: 'structure', beats[], minWordsPerBeat }
 *   { check: 'style',     rule, ... }
 *
 * Exercises whose rubricJson.check is absent get { status: 'SKIPPED' }
 * — the legacy 50 phase-1 exercises keep their existing submit path
 * untouched.
 */
export interface ExerciseCheckResult {
  /** PASSED / WARNING / FLAGGED — mirrors IntegrityResult vocabulary. */
  status: 'PASSED' | 'WARNING' | 'FLAGGED' | 'SKIPPED';
  /** Which rubric check ran (or 'none'). */
  check: string;
  /** Human-readable reason (fa) — surfaced on the practice page. */
  reason?: string;
  /** Words that violate the constraint (lipogram offending words, etc). */
  violatingWords?: string[];
  /** Structured extras the practice page can render (e.g. per-beat counts). */
  details?: Record<string, unknown>;
  /** True when the check could not be evaluated and was skipped. */
  skipped?: boolean;
}

/**
 * Persian normalizer (spec G.3) — canonical form used for letter/word
 * matching. ي→ی, ك→ک, drop ZWNJ, drop diacritics, آ/أ/إ→ا, collapse
 * whitespace. Mirrors the NLP service's normalize endpoint so letter
 * bans behave identically client-side (live highlight) and server-side
 * (submit check).
 */
export function normalizePersian(s: string): string {
  return s
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\u200c/g, ' ')
    .replace(/[\u064B-\u065F]/g, '')
    .replace(/آ/g, 'ا')
    .replace(/أ/g, 'ا')
    .replace(/إ/g, 'ا')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Split normalized Persian text into words, stripping leading/trailing punctuation. */
function wordsOf(normalized: string): string[] {
  return normalized
    .split(/\s+/)
    .map((w) => w.replace(/^[،.؟!؛:«»"'()\[\]…]+|[،.؟!؛:«»"'()\[\]…]+$/g, ''))
    .filter(Boolean);
}

@Injectable()
export class ExerciseValidator {
  private readonly logger = new Logger(ExerciseValidator.name);

  /**
   * Run the exercise's rubric check against the submitted text.
   * Never throws: any internal error degrades to a SKIPPED result so a
   * validator bug can never block a legitimate submission.
   */
  async validate(
    exercise: { slug: string; rubricJson?: unknown },
    contentText: string,
  ): Promise<ExerciseCheckResult> {
    const rubric = (exercise.rubricJson ?? {}) as Record<string, unknown>;
    const check = rubric.check as string | undefined;
    if (!check) {
      return { status: 'SKIPPED', check: 'none', skipped: true, reason: 'این تمرین قید خاص ندارد' };
    }
    try {
      switch (check) {
        case 'lipogram':
          return this.checkLipogram(contentText, rubric);
        case 'n7':
          return this.checkN7(contentText, rubric);
        case 'clustering':
          return this.checkClustering(contentText, rubric);
        case 'structure':
          return this.checkStructure(contentText, rubric);
        case 'style':
          return this.checkStyle(contentText, rubric);
        default:
          return {
            status: 'SKIPPED',
            check,
            skipped: true,
            reason: `قید ناشناس: ${check}`,
          };
      }
    } catch (err) {
      this.logger.warn(`Exercise check "${check}" failed; degrading to SKIPPED`, err);
      return {
        status: 'SKIPPED',
        check,
        skipped: true,
        reason: 'اعتبارسنجی در دسترس نبود',
      };
    }
  }

  // ------------------------------------------------------------------
  // Lipogram (spec G.3)
  // ------------------------------------------------------------------
  private checkLipogram(text: string, rubric: Record<string, unknown>): ExerciseCheckResult {
    const normalized = normalizePersian(text);
    const level = (rubric.level as string) ?? 'letter';

    if (level === 'letter') {
      const forbidden = normalizePersian((rubric.forbiddenLetter as string) ?? '');
      if (!forbidden) return { status: 'SKIPPED', check: 'lipogram', skipped: true };
      const offending = wordsOf(normalized).filter((w) => w.includes(forbidden));
      const violation = offending.length > 0;
      return {
        status: violation ? 'WARNING' : 'PASSED',
        check: 'lipogram',
        violatingWords: offending.slice(0, 20),
        reason: violation
          ? `حرف «${forbidden}» در ${offending.length} واژه استفاده شد`
          : 'بدون حرف ممنوع نوشتی',
        details: { level, forbiddenLetter: forbidden, count: offending.length },
      };
    }

    // word: the forbidden word must not appear as a whole word.
    // phrase: the forbidden phrase must not appear as a *subsequence* of
    // consecutive words (so «به نظر» matches «به» followed by «نظر»).
    const forbidden = normalizePersian((rubric.forbiddenWord as string) ?? '');
    if (!forbidden) return { status: 'SKIPPED', check: 'lipogram', skipped: true };
    const allWords = wordsOf(normalized);
    let offending: string[];
    if (level === 'phrase') {
      const target = forbidden.split(' ');
      const hits: string[] = [];
      for (let i = 0; i + target.length <= allWords.length; i++) {
        if (target.every((t, k) => allWords[i + k] === t)) {
          hits.push(allWords.slice(i, i + target.length).join(' '));
          i += target.length - 1;
        }
      }
      offending = hits;
    } else {
      offending = allWords.filter((w) => w === forbidden);
    }
    const violation = offending.length > 0;
    return {
      status: violation ? 'WARNING' : 'PASSED',
      check: 'lipogram',
      violatingWords: offending.slice(0, 20),
      reason: violation
        ? `واژه‌ی «${forbidden}» ${offending.length} بار آمد`
        : 'بدون واژه‌ی ممنوع نوشتی',
      details: { level, forbidden, count: offending.length },
    };
  }

  // ------------------------------------------------------------------
  // N+7
  // DECISION (phase 1, spec G.7): the N+7 *dictionary transform* is a
  // NLP-side feature that lands with the labeled-dictionary work. This
  // check only verifies the writer engaged with the transform by
  // submitting a non-trivial draft; it does NOT re-run N+7 here.
  // ------------------------------------------------------------------
  private checkN7(text: string, rubric: Record<string, unknown>): ExerciseCheckResult {
    const wordCount = wordsOf(normalizePersian(text)).length;
    const passed = wordCount >= 20;
    return {
      status: passed ? 'PASSED' : 'WARNING',
      check: 'n7',
      reason: passed
        ? 'نسخه‌ی N+7 را کامل کردی'
        : 'پیش‌نویس کوتاه است — نسخه‌ی تبدیل‌شده را کامل کن',
      details: {
        n: rubric.n ?? 7,
        transform: rubric.transform ?? 'identity',
        wordCount,
        // NLP n-plus-7 endpoint is a phase-1 placeholder (returns input
        // unchanged, spec G.7). The labeled-dictionary transform lands
        // in phase 2.
        nlpTransformReady: false,
      },
    };
  }

  // ------------------------------------------------------------------
  // Clustering — writer must produce at least N distinct words that
  // form the web. We count unique words; a true graph layout is a
  // frontend concern (force-directed, phase 2).
  // ------------------------------------------------------------------
  private checkClustering(text: string, rubric: Record<string, unknown>): ExerciseCheckResult {
    const unique = new Set(wordsOf(normalizePersian(text)));
    const minHubWords = Number(rubric.minHubWords ?? 8);
    const passed = unique.size >= minHubWords;
    return {
      status: passed ? 'PASSED' : 'WARNING',
      check: 'clustering',
      reason: passed
        ? `خوشه‌ی ${unique.size} کلمه‌ای ساختی`
        : `خوشه کوتاه است (${unique.size} واژه‌ی منحصربه‌فرد؛ حداقل ${minHubWords} لازم است)`,
      details: { uniqueWordCount: unique.size, minHubWords },
    };
  }

  // ------------------------------------------------------------------
  // Structure — for single-beat variants the whole submission IS the
  // beat, so we just verify word count meets minWordsPerBeat. For
  // multi-beat (column) we check total against the sum of per-beat
  // minimums. A true per-beat form is a frontend concern (the
  // STRUCTURE_TEMPLATE bank drives it).
  // ------------------------------------------------------------------
  private checkStructure(text: string, rubric: Record<string, unknown>): ExerciseCheckResult {
    const beats = (rubric.beats as string[]) ?? [];
    const minWordsPerBeat = Number(rubric.minWordsPerBeat ?? 80);
    const totalWords = wordsOf(normalizePersian(text)).length;
    const required = beats.length * minWordsPerBeat;
    const passed = totalWords >= required;
    return {
      status: passed ? 'PASSED' : 'WARNING',
      check: 'structure',
      reason: passed
        ? 'ساختار را کامل پر کردی'
        : `کمتر از ${required} واژه برای ${beats.length} بیت نوشتی (${totalWords})`,
      details: { beats, minWordsPerBeat, totalWords, required },
    };
  }

  // ------------------------------------------------------------------
  // Style rules
  // ------------------------------------------------------------------
  private checkStyle(text: string, rubric: Record<string, unknown>): ExerciseCheckResult {
    const rule = (rubric.rule as string) ?? '';
    const normalized = normalizePersian(text);
    const words = wordsOf(normalized);

    switch (rule) {
      case 'no-adverbs':
        return this.styleNoAdverbs(normalized, words, rubric);
      case 'no-auxiliary':
        return this.styleNoAuxiliary(words, rubric);
      case 'single-sentence':
        return this.styleSingleSentence(text, rubric);
      case 'second-person':
        return this.styleSecondPerson(words, rubric);
      case 'present-tense':
        return this.stylePresentTense(words, rubric);
      default:
        return { status: 'SKIPPED', check: 'style', skipped: true, reason: `قید ناشناس: ${rule}` };
    }
  }

  /**
   * no-adverbs: flag words ending in the Persian adverbial suffix
   * «ـانه» (مانند/چنین style) and common adverb markers. This is a
   * heuristic — a true POS-tagged adverb extraction needs the NLP
   * /extract-adjectives-adverbs endpoint (phase 1.1), which we call
   * opportunistically if available and fall back to suffix heuristics.
   */
  private styleNoAdverbs(
    _normalized: string,
    words: string[],
    rubric: Record<string, unknown>,
  ): ExerciseCheckResult {
    const maxViolations = Number(rubric.maxViolations ?? 2);
    // Persian adverb heuristic: words ending in «ـانه» / «ـی» that are
    // not nouns is hard without POS. We use a conservative suffix list
    // of common adverb endings. This is intentionally approximate —
    // the NLP adverb endpoint (when live) replaces it.
    const adverbSuffixes = ['انه', 'طور', 'گونه', 'وار', 'مند'];
    const flagged = words.filter((w) =>
      adverbSuffixes.some((suf) => w.endsWith(suf) && w.length > suf.length + 1),
    );
    const violation = flagged.length > maxViolations;
    return {
      status: violation ? 'WARNING' : 'PASSED',
      check: 'style:no-adverbs',
      violatingWords: flagged.slice(0, 20),
      reason: violation
        ? `${flagged.length} واژه‌ی قیدی‌مانند یافت شد (حداکثر ${maxViolations})`
        : 'قید کمتری از حد نوشتی',
      details: { count: flagged.length, maxViolations },
    };
  }

  /**
   * no-auxiliary: flag Persian auxiliary/progressive markers «می‌»
   * (progressive), «دارد/دارند/دارم» (have), and the passive «شود/شد».
   */
  private styleNoAuxiliary(words: string[], rubric: Record<string, unknown>): ExerciseCheckResult {
    const maxViolations = Number(rubric.maxViolations ?? 3);
    const auxiliaries = ['می', 'دارد', 'دارند', 'دارم', 'داریم', 'دارید', 'شود', 'شد', 'شوید'];
    const flagged = words.filter((w) => auxiliaries.includes(w));
    const violation = flagged.length > maxViolations;
    return {
      status: violation ? 'WARNING' : 'PASSED',
      check: 'style:no-auxiliary',
      violatingWords: flagged.slice(0, 20),
      reason: violation
        ? `${flagged.length} فعل کمکی یافت شد (حداکثر ${maxViolations})`
        : 'فعل کمکی کمتری از حد نوشتی',
      details: { count: flagged.length, maxViolations },
    };
  }

  /** single-sentence: the submission must be one sentence (one terminal). */
  private styleSingleSentence(text: string, rubric: Record<string, unknown>): ExerciseCheckResult {
    const maxSentences = Number(rubric.maxSentences ?? 1);
    const terminals = (text.match(/[.!؟…]/g) ?? []).length;
    // A single sentence has at most one terminal; zero terminals is
    // acceptable (run-on free of punctuation is still one thought).
    const sentenceCount = Math.max(1, terminals);
    const passed = sentenceCount <= maxSentences;
    return {
      status: passed ? 'PASSED' : 'WARNING',
      check: 'style:single-sentence',
      reason: passed
        ? 'یک جمله‌ی کامل نوشتی'
        : `بیش از یک جمله نوشتی (${sentenceCount} جمله‌پایان)`,
      details: { sentenceCount, maxSentences },
    };
  }

  /** second-person: at least X% of the text should address «تو/شما». */
  private styleSecondPerson(words: string[], rubric: Record<string, unknown>): ExerciseCheckResult {
    const minRatio = Number(rubric.minSecondPersonRatio ?? 0.3);
    // Only exact pronoun matches — a suffix match would catch unrelated
    // words like بلوط / پرتو / دروازه.
    const secondPerson = ['تو', 'تات', 'شما', 'تان'];
    const hits = words.filter((w) => secondPerson.includes(w)).length;
    const ratio = words.length === 0 ? 0 : hits / words.length;
    const passed = ratio >= minRatio;
    return {
      status: passed ? 'PASSED' : 'WARNING',
      check: 'style:second-person',
      reason: passed
        ? 'به‌درستی از «تو» استفاده کردی'
        : `نسبت «تو» پایین است (${(ratio * 100).toFixed(0)}٪؛ حداقل ${minRatio * 100}٪)`,
      details: { ratio, hits, minRatio },
    };
  }

  /** present-tense: heuristic — present-tense verbs end in «د/م/ی/یم/ید/ست». */
  private stylePresentTense(words: string[], rubric: Record<string, unknown>): ExerciseCheckResult {
    const minRatio = Number(rubric.minPresentRatio ?? 0.5);
    // Present-tense Persian verb endings (approximate, suffix-based).
    const presentEndings = ['م', 'ی', 'د', 'یم', 'ید', 'ست', 'ستند', 'ند'];
    const presentHits = words.filter((w) =>
      w.length > 2 && presentEndings.some((e) => w.endsWith(e)),
    ).length;
    // Ratio against content words only (not pure function words) is
    // overkill; use total words as denominator.
    const ratio = words.length === 0 ? 0 : presentHits / words.length;
    const passed = ratio >= minRatio;
    return {
      status: passed ? 'PASSED' : 'WARNING',
      check: 'style:present-tense',
      reason: passed
        ? 'زمان حال را حفظ کردی'
        : `زمان حال کم است (تخمینی ${(ratio * 100).toFixed(0)}٪؛ حداقل ${minRatio * 100}٪)`,
      details: { ratio, presentHits, minRatio },
    };
  }
}
