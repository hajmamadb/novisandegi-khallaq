import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: {
    notification: { findMany: jest.Mock; count: jest.Mock; updateMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      notification: {
        findMany: jest.fn(),
        count: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [NotificationsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(NotificationsService);
  });

  it('lists a user\'s notifications, newest first', async () => {
    prisma.notification.findMany.mockResolvedValue([]);
    await service.list('u1');
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1' },
        orderBy: { createdAt: 'desc' },
      }),
    );
  });

  it('unreadCount counts only unread rows', async () => {
    prisma.notification.count.mockResolvedValue(3);
    const res = await service.unreadCount('u1');
    expect(prisma.notification.count).toHaveBeenCalledWith({
      where: { userId: 'u1', readAt: null },
    });
    expect(res).toEqual({ count: 3 });
  });

  it('markAllRead updates only unread rows of that user', async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 5 });
    const res = await service.markAllRead('u1');
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', readAt: null },
      data: { readAt: expect.any(Date) },
    });
    expect(res).toEqual({ updated: 5 });
  });
});
