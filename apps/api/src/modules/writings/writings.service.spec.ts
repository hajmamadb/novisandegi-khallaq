import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { WritingsService } from './writings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsService } from '../events/events.service';

// Mocked events service (delete/restore log activity).
const events = { logRaw: jest.fn().mockResolvedValue(undefined) };

describe('WritingsService', () => {
  let service: WritingsService;
  let prisma: {
    writing: { findMany: jest.Mock; findFirst: jest.Mock };
    writingFolder: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      writing: { findMany: jest.fn(), findFirst: jest.fn() },
      writingFolder: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WritingsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventsService, useValue: events },
      ],
    }).compile();
    service = module.get(WritingsService);
  });

  describe('list', () => {
    it('filters by tag in-app (Prisma 5.14 has no has filter)', async () => {
      prisma.writing.findMany.mockResolvedValue([
        { id: 'w1', tags: ['قصه', 'عاشقانه'] },
        { id: 'w2', tags: ['قصه'] },
      ]);
      const res = await service.list('u1', { tag: 'قصه' });
      expect(res).toHaveLength(2);
    });

    it('excludes writings that lack the requested tag', async () => {
      prisma.writing.findMany.mockResolvedValue([
        { id: 'w1', tags: ['قصه'] },
        { id: 'w2', tags: ['دیگر'] },
      ]);
      const res = await service.list('u1', { tag: 'قصه' });
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe('w1');
    });
  });

  describe('get', () => {
    it('throws WRITING_NOT_FOUND when missing or not owned', async () => {
      prisma.writing.findFirst.mockResolvedValue(null);
      await expect(service.get('u1', 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
