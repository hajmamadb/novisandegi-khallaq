import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('MessagesService', () => {
  let service: MessagesService;
  let prisma: {
    user: { findUnique: jest.Mock };
    message: {
      groupBy: jest.Mock;
      findMany: jest.Mock;
      updateMany: jest.Mock;
      create: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      message: {
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn(),
        updateMany: jest.fn(),
        create: jest.fn(),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [MessagesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(MessagesService);
  });

  describe('listThreads', () => {
    it('returns an empty list when there are no partners', async () => {
      const res = await service.listThreads('u1');
      expect(res).toEqual([]);
    });
  });

  describe('conversation', () => {
    it('returns empty for a self-conversation', async () => {
      const res = await service.conversation('u1', 'u1');
      expect(res).toEqual([]);
    });
  });

  describe('send', () => {
    it('rejects sending to oneself', async () => {
      await expect(
        service.send('u1', 'u1', 'hi'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when the recipient does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.send('u1', 'ghost', 'hi')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('persists a message to an existing recipient', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u2' });
      prisma.message.create.mockResolvedValue({ id: 'm1' });
      const res = await service.send('u1', 'u2', 'hi there');
      expect(res).toEqual({ id: 'm1' });
    });
  });
});
