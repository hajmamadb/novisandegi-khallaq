import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MentorshipService } from './mentorship.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('MentorshipService', () => {
  let service: MentorshipService;
  let prisma: {
    user: { findUnique: jest.Mock };
    mentorshipRequest: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      mentorshipRequest: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [MentorshipService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(MentorshipService);
  });

  describe('create', () => {
    it('rejects a user requesting themselves', async () => {
      await expect(
        service.create('u1', 'u1', 'hello'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when the target is not a mentor-type role', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u2', role: 'WRITER' });
      await expect(
        service.create('u1', 'u2', 'hello'),
      ).rejects.toThrow(NotFoundException);
    });

    it('creates a request when the mentor role is valid', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u2', role: 'MENTOR' });
      prisma.mentorshipRequest.create.mockResolvedValue({ id: 'r1' });
      const res = await service.create('u1', 'u2', 'help me');
      expect(res).toEqual({ id: 'r1' });
    });
  });

  describe('decide', () => {
    it('rejects when the request already has a decision', async () => {
      prisma.mentorshipRequest.findUnique.mockResolvedValue({
        id: 'r1',
        mentorId: 'u2',
        status: 'ACCEPTED',
      });
      await expect(service.decide('u2', 'r1', true)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('sets acceptedAt on accept', async () => {
      prisma.mentorshipRequest.findUnique.mockResolvedValue({
        id: 'r1',
        mentorId: 'u2',
        status: 'PENDING',
      });
      prisma.mentorshipRequest.update.mockResolvedValue({});
      await service.decide('u2', 'r1', true);
      expect(prisma.mentorshipRequest.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: expect.objectContaining({
          status: 'ACCEPTED',
          acceptedAt: expect.any(Date),
        }),
      });
    });
  });
});
