import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { BlogService } from './blog.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('BlogService', () => {
  let service: BlogService;
  let prisma: {
    blogPost: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      blogPost: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [BlogService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(BlogService);
  });

  describe('listPublished', () => {
    it('queries only PUBLISHED posts, newest first', async () => {
      prisma.blogPost.findMany.mockResolvedValue([]);
      await service.listPublished();
      expect(prisma.blogPost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'PUBLISHED' },
          orderBy: { publishedAt: 'desc' },
        }),
      );
    });
  });

  describe('adminUpdate', () => {
    it('throws BLOG_NOT_FOUND for a missing post', async () => {
      prisma.blogPost.findUnique.mockResolvedValue(null);
      await expect(
        service.adminUpdate('missing', { titleFa: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
