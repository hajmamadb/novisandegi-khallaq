import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BlogService {
  constructor(private readonly prisma: PrismaService) {}

  listPublished() {
    return this.prisma.blogPost.findMany({
      where: { status: 'PUBLISHED' },
      select: {
        id: true,
        slug: true,
        titleFa: true,
        excerptFa: true,
        publishedAt: true,
      },
      orderBy: { publishedAt: 'desc' },
    });
  }

  getBySlug(slug: string) {
    return this.prisma.blogPost.findUnique({
      where: { slug, status: 'PUBLISHED' },
    });
  }

  // ── Admin CRUD ──

  adminList() {
    return this.prisma.blogPost.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async adminCreate(data: {
    slug: string;
    titleFa: string;
    excerptFa: string;
    bodyMarkdown: string;
    publishedAt?: Date;
    status?: string;
  }) {
    return this.prisma.blogPost.create({
      data: {
        slug: data.slug,
        titleFa: data.titleFa,
        excerptFa: data.excerptFa,
        bodyMarkdown: data.bodyMarkdown,
        publishedAt: data.publishedAt ?? new Date(),
        status: data.status ?? 'PUBLISHED',
      },
    });
  }

  async adminUpdate(
    id: string,
    data: {
      titleFa?: string;
      excerptFa?: string;
      bodyMarkdown?: string;
      publishedAt?: Date;
      status?: string;
    },
  ) {
    const existing = await this.prisma.blogPost.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('BLOG_NOT_FOUND');
    return this.prisma.blogPost.update({ where: { id }, data });
  }

  async adminDelete(id: string) {
    const existing = await this.prisma.blogPost.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('BLOG_NOT_FOUND');
    return this.prisma.blogPost.delete({ where: { id } });
  }
}
