import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { CommunityService } from './community.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsService } from '../events/events.service';

// Mocked events service (log activity on feedback/news ops).
const events = { logRaw: jest.fn().mockResolvedValue(undefined) };

describe('CommunityService', () => {
  let service: CommunityService;
  let prisma: {
    newsItem: { findMany: jest.Mock };
    feedback: { findMany: jest.Mock; create: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      newsItem: { findMany: jest.fn() },
      feedback: { findMany: jest.fn(), create: jest.fn() },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommunityService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventsService, useValue: events },
      ],
    }).compile();
    service = module.get(CommunityService);
  });

  describe('listNews (public)', () => {
    it('only returns approved, non-sensitive items', async () => {
      prisma.newsItem.findMany.mockResolvedValue([]);
      await service.listNews();
      expect(prisma.newsItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'APPROVED', isSensitive: false },
        }),
      );
    });
  });

  describe('createFeedback', () => {
    it('rejects self-review', async () => {
      await expect(
        service.createFeedback('u1', {
          authorId: 'u1',
          targetKind: 'WRITING',
          targetId: 'w1',
          content: 'خوب بود',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.feedback.create).not.toHaveBeenCalled();
    });

    it('rejects a rating outside 1–5', async () => {
      await expect(
        service.createFeedback('u2', {
          authorId: 'u1',
          targetKind: 'WRITING',
          targetId: 'w1',
          content: 'خوب بود',
          rating: 6,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates a valid feedback row', async () => {
      prisma.feedback.create.mockResolvedValue({ id: 'f1' });
      const res = await service.createFeedback('u2', {
        authorId: 'u1',
        targetKind: 'WRITING',
        targetId: 'w1',
        content: 'عالی',
        rating: 5,
      });
      expect(res).toEqual({ id: 'f1' });
    });
  });
});
