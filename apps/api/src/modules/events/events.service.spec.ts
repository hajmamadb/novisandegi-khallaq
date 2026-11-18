import { Test, TestingModule } from '@nestjs/testing';
import { EventsService } from './events.service';
import { PrismaService } from '../../prisma/prisma.service';
import { QueueService } from '../../queues/queue.service';

describe('EventsService', () => {
  let service: EventsService;
  let prisma: {
    eventLog: { create: jest.Mock; findMany: jest.Mock; count: jest.Mock };
  };
  let queue: { enqueue: jest.Mock };

  beforeEach(async () => {
    prisma = {
      eventLog: { create: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    };
    queue = { enqueue: jest.fn().mockResolvedValue('job-id') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: PrismaService, useValue: prisma },
        { provide: QueueService, useValue: queue },
      ],
    }).compile();
    service = module.get<EventsService>(EventsService);
  });

  describe('log', () => {
    it('persists the event and enqueues badge-evaluate', async () => {
      const created = { id: 'e1', userId: 'u1', eventName: 'session_started' };
      prisma.eventLog.create.mockResolvedValue(created);

      const res = await service.log('u1', {
        eventName: 'session_started',
        eventPayloadJson: { foo: 1 },
      });

      expect(res.id).toBe('e1');
      expect(prisma.eventLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'u1',
          eventName: 'session_started',
          eventPayloadJson: { foo: 1 },
        }),
      });
      expect(queue.enqueue).toHaveBeenCalledWith('badge-evaluate', {
        userId: 'u1',
        eventId: 'e1',
      });
    });

    it('defaults payload to {} when omitted', async () => {
      prisma.eventLog.create.mockResolvedValue({ id: 'e2', userId: 'u1' });
      await service.log('u1', { eventName: 'x' });
      expect(prisma.eventLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ eventPayloadJson: {} }),
        }),
      );
    });

    it('does not throw if the enqueue fails (event still persisted)', async () => {
      prisma.eventLog.create.mockResolvedValue({ id: 'e3', userId: 'u1' });
      queue.enqueue.mockRejectedValue(new Error('queue down'));

      // Must not reject — the event write is the source of truth.
      const res = await service.log('u1', { eventName: 'x' });
      expect(res.id).toBe('e3');
    });
  });

  describe('listMine', () => {
    it('returns newest-first paginated items with total', async () => {
      prisma.eventLog.findMany.mockResolvedValue([{ id: 'a' }]);
      prisma.eventLog.count.mockResolvedValue(42);

      const res = await service.listMine('u1', { page: 2, limit: 10 });

      expect(res).toEqual({
        items: [{ id: 'a' }],
        total: 42,
        page: 2,
        limit: 10,
      });
      expect(prisma.eventLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'u1' },
          orderBy: { serverTimestamp: 'desc' },
          skip: 10,
          take: 10,
        }),
      );
    });

    it('caps limit at 200 and floors page at 1', async () => {
      prisma.eventLog.findMany.mockResolvedValue([]);
      prisma.eventLog.count.mockResolvedValue(0);
      await service.listMine('u1', { page: -5, limit: 9999 });
      expect(prisma.eventLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 200 }),
      );
    });

    it('filters by eventName when provided', async () => {
      prisma.eventLog.findMany.mockResolvedValue([]);
      prisma.eventLog.count.mockResolvedValue(0);
      await service.listMine('u1', { eventName: 'session_started' });
      expect(prisma.eventLog.count).toHaveBeenCalledWith({
        where: { userId: 'u1', eventName: 'session_started' },
      });
    });
  });
});
