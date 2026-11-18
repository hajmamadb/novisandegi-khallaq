import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsService } from '../events/events.service';

// Mocked events service (delete/restore log activity).
const events = { logRaw: jest.fn().mockResolvedValue(undefined) };

describe('ProjectsService', () => {
  let service: ProjectsService;
  let prisma: {
    project: { findFirst: jest.Mock; findMany: jest.Mock; delete: jest.Mock; update: jest.Mock };
    projectChapter: { create: jest.Mock; findFirst: jest.Mock; update: jest.Mock; delete: jest.Mock; aggregate: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      project: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        delete: jest.fn(),
        update: jest.fn(),
      },
      projectChapter: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        aggregate: jest.fn(),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventsService, useValue: events },
      ],
    }).compile();
    service = module.get(ProjectsService);
  });

  describe('remove', () => {
    it('rejects when the project is not owned by the user', async () => {
      prisma.project.findFirst.mockResolvedValue(null);
      await expect(service.remove('u1', 'p1')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.project.delete).not.toHaveBeenCalled();
    });
  });

  describe('addChapter', () => {
    it('computes word count and orders after existing chapters', async () => {
      prisma.project.findFirst.mockResolvedValue({
        id: 'p1',
        userId: 'u1',
        _count: { chapters: 2 },
      });
      prisma.projectChapter.create.mockResolvedValue({
        id: 'c3',
        title: 'Chapter 3',
        wordCount: 4,
        displayOrder: 2,
      });
      prisma.projectChapter.aggregate.mockResolvedValue({
        _sum: { wordCount: 100 },
      });
      prisma.project.update.mockResolvedValue({});

      const res = await service.addChapter('u1', 'p1', {
        title: 'Chapter 3',
        contentText: 'one two three four',
      });
      expect(res.wordCount).toBe(4);
      expect(res.displayOrder).toBe(2);
      expect(prisma.project.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { wordCountTotal: 100 },
      });
    });

    it('throws when the project is not found', async () => {
      prisma.project.findFirst.mockResolvedValue(null);
      await expect(
        service.addChapter('u1', 'missing', { title: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
