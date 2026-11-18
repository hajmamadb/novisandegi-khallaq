import { ExerciseValidator, normalizePersian } from './exercise.validator';

describe('normalizePersian', () => {
  it('canonicalizes Arabic-form letters and alef variants', () => {
    expect(normalizePersian('كاتب')).toBe('کاتب');
    expect(normalizePersian('ياد')).toBe('یاد');
    expect(normalizePersian('آسمان')).toBe('اسمان');
  });

  it('treats ZWNJ as a word separator (progressive می‌رفتم → می رفتم)', () => {
    expect(normalizePersian('می‌رفتم').split(' ')).toEqual(['می', 'رفتم']);
  });

    it('strips diacritics and collapses whitespace', () => {
      expect(normalizePersian('  سلام\u064E  جهان')).toBe('سلام جهان');
    });
});

describe('ExerciseValidator', () => {
  let validator: ExerciseValidator;
  beforeEach(() => {
    validator = new ExerciseValidator();
  });

  const ex = (rubricJson: unknown) => ({ slug: 'test', rubricJson });

  describe('no rubric', () => {
    it('skips exercises without a check (legacy phase-1 set)', async () => {
      const res = await validator.validate(ex({}), 'هر چه بخواهی بنویس');
      expect(res.status).toBe('SKIPPED');
      expect(res.skipped).toBe(true);
      expect(res.check).toBe('none');
    });
  });

  describe('lipogram (letter)', () => {
    const lipogram = ex({ check: 'lipogram', forbiddenLetter: 'و', level: 'letter' });

    it('passes text without the forbidden letter', async () => {
      const res = await validator.validate(lipogram, 'باران از آسمان ریخت');
      expect(res.status).toBe('PASSED');
      expect(res.violatingWords).toEqual([]);
    });

    it('flags offending words containing the forbidden letter', async () => {
      const res = await validator.validate(lipogram, 'او در میان دوستان رفت');
      expect(res.status).toBe('WARNING');
      // both «او» and «دوستان» contain و
      expect(res.violatingWords).toEqual(expect.arrayContaining(['او', 'دوستان']));
    });

    it('treats the Arabic-form letter as the same forbidden letter', async () => {
      const res = await validator.validate(
        ex({ check: 'lipogram', forbiddenLetter: 'ک', level: 'letter' }),
        'كنار',
      );
      expect(res.status).toBe('WARNING');
      expect(res.violatingWords).toEqual(['کنار']);
    });

    it('skips when forbiddenLetter is missing', async () => {
      const res = await validator.validate(ex({ check: 'lipogram', level: 'letter' }), 'متن');
      expect(res.skipped).toBe(true);
    });
  });

  describe('lipogram (word / phrase)', () => {
    it('flags a whole-word match at word level', async () => {
      const res = await validator.validate(
        ex({ check: 'lipogram', forbiddenWord: 'و', level: 'word' }),
        'باران و باد',
      );
      expect(res.status).toBe('WARNING');
      expect(res.violatingWords).toEqual(['و']);
    });

    it('does not flag a substring of a longer word at word level', async () => {
      const res = await validator.validate(
        ex({ check: 'lipogram', forbiddenWord: 'و', level: 'word' }),
        'باران وباد شد',
      );
      expect(res.status).toBe('PASSED');
    });

    it('flags a phrase occurrence at phrase level', async () => {
      const res = await validator.validate(
        ex({ check: 'lipogram', forbiddenWord: 'به نظر', level: 'phrase' }),
        'من به نظر این نمی‌افتم',
      );
      expect(res.status).toBe('WARNING');
    });
  });

  describe('n7', () => {
    it('passes a non-trivial draft', async () => {
      const text = Array.from({ length: 25 }, (_, i) => `کلمه${i}`).join(' ');
      const res = await validator.validate(ex({ check: 'n7', transform: 'past-tense', n: 7 }), text);
      expect(res.status).toBe('PASSED');
      expect(res.details).toMatchObject({ n: 7, transform: 'past-tense', nlpTransformReady: false });
    });

    it('warns on a short draft', async () => {
      const res = await validator.validate(ex({ check: 'n7', n: 7 }), 'فقط پنج کلمه دارد اینجاست');
      expect(res.status).toBe('WARNING');
      expect(res.details?.wordCount).toBeLessThan(20);
    });
  });

  describe('clustering', () => {
    it('passes when unique word count meets the minimum', async () => {
      const res = await validator.validate(
        ex({ check: 'clustering', minHubWords: 8 }),
        'غم اندوه همدردی شادی خنده لبخند اشک درد',
      );
      expect(res.status).toBe('PASSED');
      expect(res.details?.uniqueWordCount).toBe(8);
    });

    it('warns when too few unique words (repetitions do not count)', async () => {
      const res = await validator.validate(
        ex({ check: 'clustering', minHubWords: 8 }),
        'غم غم اندوه شادی خنده لبخند',
      );
      expect(res.status).toBe('WARNING');
      expect(res.details?.uniqueWordCount).toBe(5);
    });
  });

  describe('structure', () => {
    it('passes when total words cover every beat minimum', async () => {
      const text = Array.from({ length: 90 }, (_, i) => `واژه${i}`).join(' ');
      const res = await validator.validate(
        ex({ check: 'structure', beats: ['ordinary-world'], minWordsPerBeat: 80 }),
        text,
      );
      expect(res.status).toBe('PASSED');
    });

    it('multiplies the minimum by the beat count (column story)', async () => {
      const text = Array.from({ length: 150 }, (_, i) => `واژه${i}`).join(' ');
      const res = await validator.validate(
        ex({ check: 'structure', beats: ['column-1', 'column-2'], minWordsPerBeat: 100 }),
        text,
      );
      expect(res.status).toBe('WARNING');
      expect(res.details).toMatchObject({ required: 200, totalWords: 150, beats: ['column-1', 'column-2'] });
    });
  });

  describe('style', () => {
    it('no-adverbs: warns past maxViolations', async () => {
      const res = await validator.validate(
        ex({ check: 'style', rule: 'no-adverbs', maxViolations: 1 }),
        'آرامانه دیرگاه تندوار رفتند',
      );
      expect(res.status).toBe('WARNING');
      expect(res.check).toBe('style:no-adverbs');
      expect(res.violatingWords?.length).toBeGreaterThan(1);
    });

    it('no-adverbs: passes under the threshold', async () => {
      const res = await validator.validate(
        ex({ check: 'style', rule: 'no-adverbs', maxViolations: 2 }),
        'او در خیابان قدم می‌زد',
      );
      expect(res.status).toBe('PASSED');
    });

    it('no-auxiliary: counts auxiliary markers', async () => {
      const res = await validator.validate(
        ex({ check: 'style', rule: 'no-auxiliary', maxViolations: 0 }),
        'او می‌خواست برود و داشت فکر می‌کرد',
      );
      expect(res.status).toBe('WARNING');
      // می + می → 2 flagged auxiliaries
      expect(res.details?.count).toBe(2);
    });

    it('single-sentence: one terminal passes', async () => {
      const res = await validator.validate(
        ex({ check: 'style', rule: 'single-sentence', maxSentences: 1 }),
        'باران آمد و همه پناهی گرفتند',
      );
      expect(res.status).toBe('PASSED');
    });

    it('single-sentence: two terminals warn', async () => {
      const res = await validator.validate(
        ex({ check: 'style', rule: 'single-sentence', maxSentences: 1 }),
        'باران آمد. همه پناهی گرفتند.',
      );
      expect(res.status).toBe('WARNING');
      expect(res.details?.sentenceCount).toBe(2);
    });

    it('second-person: ratio below threshold warns', async () => {
      const res = await validator.validate(
        ex({ check: 'style', rule: 'second-person', minSecondPersonRatio: 0.5 }),
        'تو در اتاق ایستاده بودی',
      );
      expect(res.status).toBe('WARNING');
    });

    it('second-present: exact pronoun match — no false positives on suffix words', async () => {
      const res = await validator.validate(
        ex({ check: 'style', rule: 'second-person', minSecondPersonRatio: 0.3 }),
        'بلوط پرتو دروازه',
      );
      // none of these are pronouns → ratio 0 → warning, and hits must be 0
      expect(res.status).toBe('WARNING');
      expect(res.details?.hits).toBe(0);
    });

    it('present-tense: reports an approximate ratio', async () => {
      const res = await validator.validate(
        ex({ check: 'style', rule: 'present-tense', minPresentRatio: 0.5 }),
        'من می‌روم تو می‌آیی او می‌نشیند',
      );
      expect(res.details?.ratio).toBeGreaterThanOrEqual(0);
      expect(res.status).toMatch(/^PASSED|WARNING$/);
    });

    it('skips an unknown style rule', async () => {
      const res = await validator.validate(ex({ check: 'style', rule: 'nope' }), 'متن');
      expect(res.status).toBe('SKIPPED');
      expect(res.skipped).toBe(true);
    });
  });

  describe('unknown check kind', () => {
    it('degrades to SKIPPED instead of throwing', async () => {
      const res = await validator.validate(ex({ check: 'mystery' }), 'متن');
      expect(res.status).toBe('SKIPPED');
      expect(res.check).toBe('mystery');
    });
  });

  describe('robustness', () => {
    it('never throws on empty text', async () => {
      const res = await validator.validate(ex({ check: 'lipogram', forbiddenLetter: 'و' }), '');
      expect(res.status).toBe('PASSED');
    });

    it('never throws on a malformed rubric (crash-safe degradation)', async () => {
      const res = await validator.validate(ex({ check: 'structure', beats: 'not-an-array' }), 'متن');
      expect(['PASSED', 'WARNING', 'SKIPPED']).toContain(res.status);
    });
  });
});
