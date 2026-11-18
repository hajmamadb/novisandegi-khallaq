import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { IntegrityService, persianCharRatio } from './integrity.service';
import { NlpService } from './nlp.service';
import { PrismaService } from '../../prisma/prisma.service';
import { Submission } from '@prisma/client';

describe('IntegrityService', () => {
  let service: IntegrityService;
  let prisma: {
    integrityCheck: { createMany: jest.Mock; findMany: jest.Mock };
    submission: { update: jest.Mock; findMany: jest.Mock };
    draft: { findMany: jest.Mock };
    exerciseSession: { findUnique: jest.Mock };
  };
  let nlp: { isAvailable: jest.Mock; vocabularyStats: jest.Mock; cosineSimilarity: jest.Mock };

  const fakeSubmission = {
    id: 'sub-1',
    sessionId: 'sess-1',
    userId: 'u1',
    wordCount: 100,
    contentText: '',
  } as unknown as Submission;

  const buildInput = (over: {
    contentText?: string;
    clientStats?: Record<string, unknown>;
  } = {}) => ({
    submission: fakeSubmission,
    contentText: over.contentText ?? 'متن فارسی نمونه برای بررسی یکدستی.',
    clientStats: over.clientStats,
  });

  beforeEach(async () => {
    prisma = {
      integrityCheck: {
        createMany: jest.fn().mockResolvedValue({ count: 7 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      submission: { update: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]) },
      draft: { findMany: jest.fn().mockResolvedValue([]) },
      exerciseSession: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    nlp = {
      // Default: NLP down → similarity/vocab checks degrade to PASSED.
      isAvailable: jest.fn().mockResolvedValue(false),
      vocabularyStats: jest.fn().mockResolvedValue(null),
      cosineSimilarity: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntegrityService,
        { provide: PrismaService, useValue: prisma },
        { provide: NlpService, useValue: nlp },
        ConfigService,
      ],
    }).compile();
    service = module.get<IntegrityService>(IntegrityService);
  });

  const run = (over: Parameters<typeof buildInput>[0] = {}) =>
    service.run(buildInput(over));

  describe('persianCharRatio', () => {
    it('returns 1 for empty text', () => {
      expect(persianCharRatio('')).toBe(1);
    });
    it('is high for Persian text', () => {
      expect(persianCharRatio('کارگاه یک کارنویس است')).toBeGreaterThan(0.7);
    });
    it('is low for English text', () => {
      expect(persianCharRatio('the quick brown fox jumps over the lazy dog')).toBeLessThan(0.7);
    });
  });

  describe('PASTE', () => {
    it('FLAGS when pasteCharCount/contentLength > 0.20', async () => {
      await run({ clientStats: { pasteCharCount: 300 } });
      const rows = await prisma.integrityCheck.createMany.mock.calls[0][0].data;
      const paste = rows.find((r) => r.checkType === 'PASTE');
      expect(paste.result).toBe('FLAGGED');
    });

    it('PASSES when paste ratio is under threshold', async () => {
      await run({ clientStats: { pasteCharCount: 5 } });
      const rows = await prisma.integrityCheck.createMany.mock.calls[0][0].data;
      const paste = rows.find((r) => r.checkType === 'PASTE');
      expect(paste.result).toBe('PASSED');
    });
  });

  describe('TYPING_SPEED', () => {
    it('WARNS when keystrokes/activeTime > 12', async () => {
      await run({ clientStats: { totalKeystrokes: 200, activeTimeSeconds: 10 } });
      const rows = await prisma.integrityCheck.createMany.mock.calls[0][0].data;
      const t = rows.find((r) => r.checkType === 'TYPING_SPEED');
      expect(t.result).toBe('WARNING');
    });
    it('PASSES when the speed is normal', async () => {
      await run({ clientStats: { totalKeystrokes: 60, activeTimeSeconds: 10 } });
      const rows = await prisma.integrityCheck.createMany.mock.calls[0][0].data;
      const t = rows.find((r) => r.checkType === 'TYPING_SPEED');
      expect(t.result).toBe('PASSED');
    });
  });

  describe('LANGUAGE', () => {
    it('WARNS on mostly-English content', async () => {
      await run({ contentText: 'this is mostly english text and no persian at all' });
      const rows = await prisma.integrityCheck.createMany.mock.calls[0][0].data;
      const lang = rows.find((r) => r.checkType === 'LANGUAGE');
      expect(lang.result).toBe('WARNING');
    });
  });

  describe('aggregate + persistence', () => {
    it('writes FLAGGED aggregate when a check flags, and persists checks', async () => {
      const result = await run({ clientStats: { pasteCharCount: 300 } });
      expect(prisma.submission.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: { integrityResult: 'FLAGGED' },
      });
      expect(prisma.integrityCheck.createMany).toHaveBeenCalledTimes(1);
      expect(result).toEqual([]); // findMany returns [] in the mock
    });

    it('aggregates to PASSED when everything passes and NLP is down', async () => {
      await run({ contentText: 'متن کاملاً فارسی و سالم است' });
      expect(prisma.submission.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { integrityResult: 'PASSED' } }),
      );
    });
  });

  describe('NLP-dependent checks degrade when service is down', () => {
    it('VOCABULARY/SELF_REPEAT/SIMILARITY_BANK all pass with skip markers', async () => {
      await run();
      const rows = await prisma.integrityCheck.createMany.mock.calls[0][0].data;
      const vocab = rows.find((r) => r.checkType === 'VOCABULARY');
      const self = rows.find((r) => r.checkType === 'SELF_REPEAT');
      const bank = rows.find((r) => r.checkType === 'SIMILARITY_BANK');
      expect(vocab.result).toBe('PASSED');
      expect(self.result).toBe('PASSED');
      expect((self.detailsJson as Record<string, unknown>).skipped).toBe('nlp_unavailable');
      expect(bank.result).toBe('PASSED');
      expect((bank.detailsJson as Record<string, unknown>).skipped).toBe('nlp_unavailable');
    });
  });

  describe('SELF_REPEAT flags a near-identical prior submission', () => {
    it('FLAGS when max cosine with a prior draft > 0.90', async () => {
      nlp.isAvailable.mockResolvedValue(true);
      nlp.cosineSimilarity.mockResolvedValue(0.95);
      prisma.submission.findMany.mockResolvedValue([
        { id: 'sub-0', finalDraftId: 'd-0' },
      ]);
      prisma.draft.findMany.mockResolvedValue([
        { id: 'd-0', contentText: 'پیش‌نویس قبلی بسیار مشابه.' },
      ]);

      await run();
      const rows = await prisma.integrityCheck.createMany.mock.calls[0][0].data;
      const self = rows.find((r) => r.checkType === 'SELF_REPEAT');
      expect(self.result).toBe('FLAGGED');
    });
  });
});
