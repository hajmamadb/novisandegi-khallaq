import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  SessionsService,
  countWords,
  promptFieldsForItem,
} from './sessions.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { SelectorService } from '../banks/selectors/selector.service';
import { IntegrityService } from '../integrity/integrity.service';
import { XpService } from '../gamification/xp.service';
import { StreakService } from '../gamification/streak.service';
import { QuestService } from '../gamification/quests/quest.service';
import { SeriesService } from '../gamification/series/series.service';
import { StaircaseService } from '../gamification/staircase/staircase.service';
import { ExerciseValidator } from '../exercises/exercise.validator';

describe('SessionsService', () => {
  let service: SessionsService;
  let prisma: {
    exerciseType: { findUnique: jest.Mock; findUniqueOrThrow: jest.Mock };
    exerciseSession: { findUnique: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock };
    draft: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; findUnique: jest.Mock };
    submission: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    eventLog: { findMany: jest.Mock };
  };
  const events = { logRaw: jest.fn() };
  // Mocked selector — only exercised by the bank-driven create path.
  const selector = { draw: jest.fn() };
  // Mocked integrity — submit now runs the integrity pipeline (step 8).
  const integrity = { run: jest.fn().mockResolvedValue([]) };
  // Mocked gamification — submit now awards XP and extends streak (step 9).
  const xp = {
    awardForSubmission: jest.fn().mockResolvedValue({
      base: 30, finalXp: 30, multipliers: {}, xpTotal: 30, level: 1, levelUps: [],
    }),
  };
  const streak = { onSubmitted: jest.fn().mockResolvedValue(1) };
  // Mocked daily-quest service (I.10 one-variety hook in submit).
  const quests = { recordProgress: jest.fn().mockResolvedValue(undefined) };
  // Mocked series tracking (Phase 2 — fire-and-forget in submit).
  const series = { track: jest.fn().mockResolvedValue(undefined) };
  // Mocked word-target staircase (Phase 2 — fire-and-forget in submit).
  const staircase = { track: jest.fn().mockResolvedValue(false) };
  // Mocked per-exercise constraint check (legacy rubricJson {} → SKIPPED).
  const exerciseValidator = {
    validate: jest.fn().mockResolvedValue({
      status: 'SKIPPED',
      check: 'none',
      skipped: true,
      reason: 'این تمرین قید خاص ندارد',
    }),
  };

  const validExercise = {
    id: 'e1',
    slug: 'freewriting',
    title: 'نوشتن آزاد',
    category: 'BASIC',
    accessLevel: 'NOVICE',
    description: 'Write freely',
    durationSeconds: 300,
    wordTargetMin: 50,
    wordTargetMax: 500,
    bankSourceType: null,
    rubricJson: {},
    skillWeightsJson: {},
    baseXp: 30,
    difficultyBase: 1.0,
    isActive: true,
    displayOrder: 1,
  };

  beforeEach(async () => {
    prisma = {
      exerciseType: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn() },
      exerciseSession: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
      draft: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), findUnique: jest.fn() },
      submission: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      // I.10: trackOneVariety reads prior exercise_submitted events.
      eventLog: { findMany: jest.fn().mockResolvedValue([]) },
    };
    events.logRaw = jest.fn();
    selector.draw = jest.fn();
    quests.recordProgress = jest.fn().mockResolvedValue(undefined);
    series.track = jest.fn().mockResolvedValue(undefined);
    integrity.run = jest.fn().mockResolvedValue([]);
    xp.awardForSubmission = jest.fn().mockResolvedValue({
      base: 30, finalXp: 30, multipliers: {}, xpTotal: 30, level: 1, levelUps: [],
    });
    streak.onSubmitted = jest.fn().mockResolvedValue(1);
    exerciseValidator.validate = jest.fn().mockResolvedValue({
      status: 'SKIPPED',
      check: 'none',
      skipped: true,
      reason: 'این تمرین قید خاص ندارد',
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventsService, useValue: events },
        { provide: SelectorService, useValue: selector },
        { provide: IntegrityService, useValue: integrity },
        { provide: XpService, useValue: xp },
        { provide: StreakService, useValue: streak },
        { provide: QuestService, useValue: quests },
        { provide: SeriesService, useValue: series },
        { provide: StaircaseService, useValue: staircase },
        { provide: ExerciseValidator, useValue: exerciseValidator },
      ],
    }).compile();
    service = module.get<SessionsService>(SessionsService);
  });

  describe('countWords', () => {
    it('counts whitespace-delimited tokens', () => {
      expect(countWords('')).toBe(0);
      expect(countWords('  hello world  ')).toBe(2);
      expect(countWords('درود بر تو جهان')).toBe(4);
    });
  });

  describe('promptFieldsForItem', () => {
    it('maps a CHARACTER row to title/content/hint', () => {
      const f = promptFieldsForItem('CHARACTER', {
        name: 'سارا',
        background: 'معلم بازنشسته',
        occupation: 'معلم',
        temperament: 'مهربان',
        ageRange: '۶۰+',
      });
      expect(f.sourceItemTitle).toBe('سارا');
      expect(f.sourceItemContent).toBe('معلم بازنشسته');
      expect(f.sourceItemHint).toContain('معلم');
    });

    it('maps a PLACE row with suggestedSenses into the hint', () => {
      const f = promptFieldsForItem('PLACE', {
        name: 'بازار',
        description: 'شلوغ و پرهیاهو',
        suggestedSenses: ['بویایی', 'شنوایی'],
      });
      expect(f.sourceItemTitle).toBe('بازار');
      expect(f.sourceItemContent).toBe('شلوغ و پرهیاهو');
      expect(f.sourceItemHint).toContain('بویایی');
    });

    it('falls back to a generic senses hint when suggestedSenses is empty', () => {
      const f = promptFieldsForItem('PLACE', { name: 'دشت' });
      expect(f.sourceItemHint).toContain('حواس پنج');
    });

    it('maps a STYLE_PARAGRAPH row (author/work/styleFeature)', () => {
      const f = promptFieldsForItem('STYLE_PARAGRAPH', {
        originalText: 'باران بر پنجره می‌کوبید',
        author: null,
        work: 'نمونه',
        styleFeature: 'جمله‌ی طولای توصیفی',
      });
      expect(f.sourceItemTitle).toBe('نمونه');
      expect(f.sourceItemContent).toBe('باران بر پنجره می‌کوبید');
      expect(f.sourceItemHint).toContain('جمله‌ی طولای توصیفی');
    });

    it('maps an EMOTION row with a show-dont-tell hint', () => {
      const f = promptFieldsForItem('EMOTION', {
        word: 'grief',
        emotion: 'غم',
        showSample: 'دستانش لرزید',
      });
      expect(f.sourceItemTitle).toBe('غم');
      expect(f.sourceItemHint).toContain('«غم»');
    });

    it('maps a WORD row', () => {
      const f = promptFieldsForItem('WORD', { text: 'باران' });
      expect(f.sourceItemContent).toBe('باران');
    });

    it('returns {} for null bankType (non-bank exercise)', () => {
      expect(promptFieldsForItem(null, null)).toEqual({});
    });

    it('ignores empty string fields (str() guard)', () => {
      const f = promptFieldsForItem('OBJECT', { name: '', description: '' });
      expect(f.sourceItemTitle).toBeUndefined();
      expect(f.sourceItemContent).toBeUndefined();
    });
  });

  describe('create', () => {
    it('throws 404 for unknown exercise', async () => {
      prisma.exerciseType.findUnique.mockResolvedValue(null);
      await expect(
        service.create('u1', 'NOVICE', { exerciseTypeId: 'e1' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws 403 when role is below accessLevel', async () => {
      prisma.exerciseType.findUnique.mockResolvedValue({
        ...validExercise,
        accessLevel: 'CRAFTSPERSON',
      });
      await expect(
        service.create('u1', 'NOVICE', { exerciseTypeId: 'e1' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('creates an IN_PROGRESS session and logs session_started', async () => {
      prisma.exerciseType.findUnique.mockResolvedValue(validExercise);
      prisma.exerciseSession.create.mockResolvedValue({
        id: 's1',
        status: 'IN_PROGRESS',
        exerciseTypeId: 'e1',
      });
      const res = await service.create('u1', 'NOVICE', { exerciseTypeId: 'e1' });
      expect(res.session.id).toBe('s1');
      expect(res.promptSnapshot.exerciseType.slug).toBe('freewriting');
      expect(prisma.exerciseSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'u1',
            exerciseTypeId: 'e1',
            status: 'IN_PROGRESS',
          }),
        }),
      );
      expect(events.logRaw).toHaveBeenCalledWith(
        'u1',
        'session_started',
        expect.anything(),
        expect.objectContaining({ sessionId: 's1' }),
      );
    });
  });

  describe('saveDraft', () => {
    const session = { id: 's1', userId: 'u1', status: 'IN_PROGRESS' };

    it('skips when content identical to the latest version', async () => {
      prisma.exerciseSession.findUnique.mockResolvedValue(session);
      const latest = { id: 'd1', sessionId: 's1', contentText: 'same', versionNumber: 3 };
      prisma.draft.findFirst.mockResolvedValue(latest);
      const res = await service.saveDraft('s1', 'u1', { contentText: 'same' });
      expect(res.skipped).toBe(true);
      expect(prisma.draft.create).not.toHaveBeenCalled();
    });

    it('creates versionNumber = max + 1 with computed wordCount', async () => {
      prisma.exerciseSession.findUnique.mockResolvedValue(session);
      prisma.draft.findFirst.mockResolvedValue({ contentText: 'old', versionNumber: 2 });
      prisma.draft.create.mockImplementation(({ data }) => Promise.resolve({ ...data, id: 'd9' }));
      const res = await service.saveDraft('s1', 'u1', { contentText: 'a b c d' });
      expect(res.skipped).toBe(false);
      expect(prisma.draft.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            versionNumber: 3,
            wordCount: 4,
            saveTrigger: 'AUTO',
          }),
        }),
      );
    });

    it('throws 403 for another user\'s session', async () => {
      prisma.exerciseSession.findUnique.mockResolvedValue({ ...session, userId: 'u2' });
      await expect(
        service.saveDraft('s1', 'u1', { contentText: 'x' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('submit', () => {
    const session = { id: 's1', userId: 'u1', status: 'IN_PROGRESS', exerciseTypeId: 'e1' };

    it('throws 400 if already submitted', async () => {
      prisma.exerciseSession.findUnique.mockResolvedValue({ ...session, status: 'SUBMITTED' });
      await expect(
        service.submit('s1', 'u1', { contentText: 'hello' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates a submission, marks session SUBMITTED, logs event', async () => {
      prisma.exerciseSession.findUnique.mockResolvedValue(session);
      prisma.exerciseType.findUniqueOrThrow.mockResolvedValue(validExercise);
      prisma.draft.findFirst.mockResolvedValue({ id: 'd1', contentText: 'final text', versionNumber: 1 });
      prisma.submission.create.mockImplementation(({ data }) =>
        Promise.resolve({ ...data, id: 'sub1', integrityResult: 'PASSED' }),
      );
      // submit re-reads the submission to capture the integrity aggregate.
      prisma.submission.findUnique.mockResolvedValue({
        id: 'sub1', wordCount: 3, integrityResult: 'PASSED',
      });
      prisma.exerciseSession.update.mockResolvedValue({ id: 's1', status: 'SUBMITTED' });

      const res = await service.submit('s1', 'u1', { contentText: 'one two three' });

      expect(res.submission.id).toBe('sub1');
      expect(res.submission.wordCount).toBe(3);
      // 3 < 50 * 0.5 => soft warning fires
      expect(res.warning).toBe('WORD_COUNT_BELOW_TARGET:3/50');
      expect(prisma.exerciseSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'SUBMITTED' }),
        }),
      );
      expect(events.logRaw).toHaveBeenCalledWith(
        'u1',
        'exercise_submitted',
        expect.anything(),
        expect.objectContaining({ sessionId: 's1' }),
      );
    });

    it('stores a real exercise constraint check in constraintCheckJson', async () => {
      prisma.exerciseSession.findUnique.mockResolvedValue(session);
      prisma.exerciseType.findUniqueOrThrow.mockResolvedValue(validExercise);
      prisma.draft.findFirst.mockResolvedValue({ id: 'd1', contentText: 'final text', versionNumber: 1 });
      prisma.submission.create.mockImplementation(({ data }) =>
        Promise.resolve({ ...data, id: 'sub1', integrityResult: 'PASSED' }),
      );
      prisma.submission.findUnique.mockResolvedValue({
        id: 'sub1', wordCount: 3, integrityResult: 'PASSED',
      });
      prisma.exerciseSession.update.mockResolvedValue({ id: 's1', status: 'SUBMITTED' });
      // This time the exercise HAS a rubric → the validator returns a real
      // (non-skipped) result that must be persisted on the submission.
      exerciseValidator.validate.mockResolvedValue({
        status: 'WARNING',
        check: 'lipogram',
        violatingWords: ['و'],
        reason: 'حرف «و» در 1 واژه استفاده شد',
        details: { level: 'letter', forbiddenLetter: 'و', count: 1 },
      });

      await service.submit('s1', 'u1', { contentText: 'one two three' });

      expect(exerciseValidator.validate).toHaveBeenCalledWith(
        validExercise,
        'one two three',
      );
      expect(prisma.submission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            constraintCheckJson: expect.objectContaining({
              // belowTarget (3 < 25) AND the real exercise check both present
              wordCount: 3,
              targetMin: 50,
              belowTarget: true,
              exercise: expect.objectContaining({ check: 'lipogram', status: 'WARNING' }),
            }),
          }),
        }),
      );
    });

    it('keeps constraintCheckJson empty of an "exercise" key when the check is skipped', async () => {
      prisma.exerciseSession.findUnique.mockResolvedValue(session);
      prisma.exerciseType.findUniqueOrThrow.mockResolvedValue(validExercise);
      prisma.draft.findFirst.mockResolvedValue({ id: 'd1', contentText: 'final text', versionNumber: 1 });
      prisma.submission.create.mockImplementation(({ data }) =>
        Promise.resolve({ ...data, id: 'sub1', integrityResult: 'PASSED' }),
      );
      prisma.submission.findUnique.mockResolvedValue({
        id: 'sub1', wordCount: 100, integrityResult: 'PASSED',
      });
      prisma.exerciseSession.update.mockResolvedValue({ id: 's1', status: 'SUBMITTED' });

      await service.submit('s1', 'u1', { contentText: 'word ' .repeat(100).trim() });

      const data = (prisma.submission.create as jest.Mock).mock.calls[0][0].data;
      expect(data.constraintCheckJson).toEqual({});
    });

    it('fires the one-variety quest when the current category is the least-submitted', async () => {
      prisma.exerciseSession.findUnique.mockResolvedValue(session);
      prisma.exerciseType.findUniqueOrThrow.mockResolvedValue(validExercise);
      prisma.draft.findFirst.mockResolvedValue({ id: 'd1', contentText: 'final text', versionNumber: 1 });
      prisma.submission.create.mockImplementation(({ data }) =>
        Promise.resolve({ ...data, id: 'sub1', integrityResult: 'PASSED' }),
      );
      prisma.submission.findUnique.mockResolvedValue({
        id: 'sub1', wordCount: 3, integrityResult: 'PASSED',
      });
      prisma.exerciseSession.update.mockResolvedValue({ id: 's1', status: 'SUBMITTED' });
      // Prior events: 'dialogue' submitted 3 times; the current 'freewriting'
      // event (just logged above) brings it to 1 → least-submitted category.
      prisma.eventLog.findMany.mockResolvedValue([
        { eventPayloadJson: { exerciseType: 'dialogue' } },
        { eventPayloadJson: { exerciseType: 'dialogue' } },
        { eventPayloadJson: { exerciseType: 'dialogue' } },
        { eventPayloadJson: { exerciseType: 'freewriting' } }, // the current one
      ]);

      await service.submit('s1', 'u1', { contentText: 'one two three' });

      expect(quests.recordProgress).toHaveBeenCalledWith('u1', 'daily.one-variety');
    });

    it('does not fire the one-variety quest when the current category is the most-submitted', async () => {
      prisma.exerciseSession.findUnique.mockResolvedValue(session);
      prisma.exerciseType.findUniqueOrThrow.mockResolvedValue(validExercise);
      prisma.draft.findFirst.mockResolvedValue({ id: 'd1', contentText: 'final text', versionNumber: 1 });
      prisma.submission.create.mockImplementation(({ data }) =>
        Promise.resolve({ ...data, id: 'sub1', integrityResult: 'PASSED' }),
      );
      prisma.submission.findUnique.mockResolvedValue({
        id: 'sub1', wordCount: 3, integrityResult: 'PASSED',
      });
      prisma.exerciseSession.update.mockResolvedValue({ id: 's1', status: 'SUBMITTED' });
      // Current 'freewriting' now at 3; 'dialogue' only once → not the variety.
      prisma.eventLog.findMany.mockResolvedValue([
        { eventPayloadJson: { exerciseType: 'dialogue' } },
        { eventPayloadJson: { exerciseType: 'freewriting' } },
        { eventPayloadJson: { exerciseType: 'freewriting' } },
        { eventPayloadJson: { exerciseType: 'freewriting' } }, // the current one
      ]);

      await service.submit('s1', 'u1', { contentText: 'one two three' });

      expect(quests.recordProgress).not.toHaveBeenCalled();
    });
  });

  describe('abandon', () => {
    it('throws 404 for unknown session', async () => {
      prisma.exerciseSession.findUnique.mockResolvedValue(null);
      await expect(service.abandon('ghost', 'u1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('sets status ABANDONED and logs the event', async () => {
      prisma.exerciseSession.findUnique.mockResolvedValue({ id: 's1', userId: 'u1', status: 'IN_PROGRESS' });
      prisma.exerciseSession.update.mockResolvedValue({ id: 's1', status: 'ABANDONED' });
      const res = await service.abandon('s1', 'u1');
      expect(res.status).toBe('ABANDONED');
      expect(events.logRaw).toHaveBeenCalledWith(
        'u1',
        'session_abandoned',
        expect.anything(),
        expect.objectContaining({ sessionId: 's1' }),
      );
    });
  });
});
