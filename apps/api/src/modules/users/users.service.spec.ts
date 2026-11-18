import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock };
    eventLog: { create: jest.Mock; findMany: jest.Mock };
    exerciseSession: { findMany: jest.Mock };
    submission: { findMany: jest.Mock };
    badgeAward: { findMany: jest.Mock };
    xPLedger: { findMany: jest.Mock };
    writing: { findMany: jest.Mock };
    project: { findMany: jest.Mock };
    message: { findMany: jest.Mock };
  };

  const validUser = {
    id: 'u1',
    email: 'a@b.com',
    displayName: 'Ali',
    role: 'NOVICE',
    level: 1,
    emailVerified: false,
    isActive: true,
    deletedAt: null,
    settingsJson: { theme: 'dark' },
    passwordHash: 'hash',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
  };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn() },
      eventLog: { create: jest.fn(), findMany: jest.fn() },
      exerciseSession: { findMany: jest.fn() },
      submission: { findMany: jest.fn() },
      badgeAward: { findMany: jest.fn() },
      xPLedger: { findMany: jest.fn() },
      writing: { findMany: jest.fn() },
      project: { findMany: jest.fn() },
      message: { findMany: jest.fn() },
    };
    prisma.exerciseSession.findMany.mockResolvedValue([]);
    prisma.submission.findMany.mockResolvedValue([]);
    prisma.badgeAward.findMany.mockResolvedValue([]);
    prisma.xPLedger.findMany.mockResolvedValue([]);
    prisma.eventLog.findMany.mockResolvedValue([]);
    prisma.writing.findMany.mockResolvedValue([]);
    prisma.project.findMany.mockResolvedValue([]);
    prisma.message.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('getMe', () => {
    it('returns the full profile with settingsJson', async () => {
      prisma.user.findUnique.mockResolvedValue(validUser);
      const res = await service.getMe('u1');
      expect(res.email).toBe('a@b.com');
      expect(res.settingsJson).toEqual({ theme: 'dark' });
      expect(res).not.toHaveProperty('passwordHash');
    });

    it('throws 404 for a deleted user', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...validUser, deletedAt: new Date() });
      await expect(service.getMe('u1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws 404 for a nonexistent user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getMe('ghost')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateMe', () => {
    it('shallow-merges settingsJson and logs settings_changed', async () => {
      prisma.user.findUnique.mockResolvedValue(validUser);
      prisma.user.update.mockResolvedValue({
        ...validUser,
        settingsJson: { theme: 'dark', font: 'b' },
      });

      const res = await service.updateMe('u1', { settingsJson: { font: 'b' } });

      expect(res.settingsJson).toEqual({ theme: 'dark', font: 'b' });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { settingsJson: { theme: 'dark', font: 'b' } },
      });
      expect(prisma.eventLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ eventName: 'settings_changed' }),
        }),
      );
    });

    it('updates displayName without touching settings', async () => {
      prisma.user.findUnique.mockResolvedValue(validUser);
      prisma.user.update.mockResolvedValue({ ...validUser, displayName: 'New' });

      const res = await service.updateMe('u1', { displayName: 'New' });

      expect(res.displayName).toBe('New');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { displayName: 'New' },
      });
      expect(prisma.eventLog.create).not.toHaveBeenCalled();
    });
  });

  describe('exportMe', () => {
    it('returns user + sessions + submissions + badges + xp + events', async () => {
      prisma.user.findUnique.mockResolvedValue(validUser);
      const res = await service.exportMe('u1');
      expect((res.user as { email: string }).email).toBe('a@b.com');
      expect(res.sessions).toEqual([]);
      expect(res.submissions).toEqual([]);
      expect(res.badges).toEqual([]);
      expect(res.xpLedger).toEqual([]);
      expect(res.events).toEqual([]);
      expect(res.exportedAt).toBeDefined();
    });
  });
});
