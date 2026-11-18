import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ApprovalStatus } from '@prisma/client';
import { AdminApprovalsService } from './admin-approvals.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AdminApprovalsService', () => {
  let service: AdminApprovalsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      newsItem: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn(),
      },
      character: { updateMany: jest.fn() },
      place: { updateMany: jest.fn() },
      openingLine: { updateMany: jest.fn() },
      imageAsset: { updateMany: jest.fn() },
      objectItem: { updateMany: jest.fn() },
      emotionLexicon: { updateMany: jest.fn() },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminApprovalsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(AdminApprovalsService);
  });

  describe('list', () => {
    it('merges news + bank pending items', async () => {
      prisma.newsItem.findMany.mockResolvedValue([
        {
          id: 'n1',
          title: 'News 1',
          summary: 'S',
          status: ApprovalStatus.PENDING,
          sourceName: 'src',
          category: 'politics',
          publishedAt: new Date(),
        },
      ]);
      // Bank models: findMany returns [] by default (jest.fn() unmocked → undefined
      // would break, so stub each).
      for (const k of [
        'character',
        'place',
        'openingLine',
        'imageAsset',
        'objectItem',
        'emotionLexicon',
      ]) {
        prisma[k].findMany = jest.fn().mockResolvedValue([]);
      }
      const res = await service.list();
      expect(res.items).toHaveLength(1);
      expect(res.items[0]).toMatchObject({ source: 'news', title: 'News 1' });
    });
  });

  describe('decide (news)', () => {
    it('throws ITEM_NOT_PENDING when no PENDING row matched', async () => {
      prisma.newsItem.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.decide('news', 'n1', 'approve', 'admin'),
      ).rejects.toThrow(NotFoundException);
    });

    it('approves and audits on success', async () => {
      prisma.newsItem.updateMany.mockResolvedValue({ count: 1 });
      const res = await service.decide('news', 'n1', 'approve', 'admin');
      expect(res).toEqual({ ok: true, status: ApprovalStatus.APPROVED });
      expect(prisma.newsItem.updateMany).toHaveBeenCalledWith({
        where: { id: 'n1', status: ApprovalStatus.PENDING },
        data: { status: ApprovalStatus.APPROVED },
      });
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });
  });

  describe('decide (unknown bank source)', () => {
    it('throws UNKNOWN_SOURCE for a source with no delegate', async () => {
      await expect(
        service.decide('doesNotExist', 'x', 'approve', 'admin'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
