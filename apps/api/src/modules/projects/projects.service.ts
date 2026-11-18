import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma, ProjectType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsService } from '../events/events.service';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  /** GET /projects — the user's projects with chapter counts. */
  list(userId: string, query?: { trash?: boolean }) {
    const where: Prisma.ProjectWhereInput = { userId };
    if (query?.trash) where.deletedAt = { not: null };
    else where.deletedAt = null;
    return this.prisma.project.findMany({
      where,
      select: {
        id: true,
        title: true,
        type: true,
        description: true,
        targetWords: true,
        wordCountTotal: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { chapters: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** GET /projects/:id — project + ordered chapters. */
  async get(userId: string, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, userId, deletedAt: null },
      include: {
        chapters: { orderBy: { displayOrder: 'asc' } },
      },
    });
    if (!project) throw new NotFoundException('PROJECT_NOT_FOUND');
    return project;
  }

  /** POST /projects */
  async create(
    userId: string,
    data: {
      title: string;
      type?: ProjectType;
      description?: string;
      targetWords?: number;
    },
  ) {
    return this.prisma.project.create({
      data: {
        userId,
        title: data.title,
        type: data.type ?? 'STORY',
        description: data.description ?? '',
        targetWords: data.targetWords ?? 5000,
      },
    });
  }

  /** PATCH /projects/:id */
  async update(
    userId: string,
    id: string,
    data: {
      title?: string;
      description?: string;
      targetWords?: number;
      status?: import('@prisma/client').ProjectStatus;
    },
  ) {
    await this.ensureOwned(userId, id);
    return this.prisma.project.update({ where: { id }, data });
  }

  /** DELETE /projects/:id — soft delete (30-day trash). */
  async remove(userId: string, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, userId, deletedAt: null },
      select: { id: true, title: true },
    });
    if (!project) throw new NotFoundException('PROJECT_NOT_FOUND');

    await this.prisma.project.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.events.logRaw(userId, 'project_deleted', {
      projectId: id,
      title: project.title,
    });

    return { ok: true };
  }

  /** POST /projects/:id/restore — restore a soft-deleted project. */
  async restore(userId: string, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, userId, deletedAt: { not: null } },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('PROJECT_NOT_FOUND');

    const restored = await this.prisma.project.update({
      where: { id },
      data: { deletedAt: null },
    });

    await this.events.logRaw(userId, 'project_restored', { projectId: id });
    return restored;
  }

  /** DELETE /projects/:id/permanent — hard delete (irreversible). */
  async permanentDelete(userId: string, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, userId, deletedAt: { not: null } },
      select: { id: true, title: true },
    });
    if (!project) throw new BadRequestException('NOT_IN_TRASH');

    await this.prisma.project.delete({ where: { id } });

    this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'PROJECT_PERMANENT_DELETE',
        targetType: 'Project',
        targetId: id,
        reason: `title: ${project.title}`,
        beforeJson: { id: project.id, title: project.title } as Prisma.InputJsonValue,
        afterJson: { deleted: true } as Prisma.InputJsonValue,
      },
    }).catch(() => {});

    await this.events.logRaw(userId, 'project_permanently_deleted', {
      projectId: id,
      title: project.title,
    });

    return { ok: true };
  }

  // ── Chapters ──

  /** POST /projects/:id/chapters */
  async addChapter(
    userId: string,
    projectId: string,
    data: { title: string; contentText?: string },
  ) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, userId },
      include: { _count: { select: { chapters: true } } },
    });
    if (!project) throw new NotFoundException('PROJECT_NOT_FOUND');

    const contentText = data.contentText ?? '';
    const wordCount = this.countWords(contentText);

    const chapter = await this.prisma.projectChapter.create({
      data: {
        projectId,
        title: data.title,
        contentText,
        wordCount,
        displayOrder: project._count.chapters,
      },
    });

    await this.recountProjectWords(projectId);
    return chapter;
  }

  /** PATCH /projects/:id/chapters/:chapterId */
  async updateChapter(
    userId: string,
    projectId: string,
    chapterId: string,
    data: { title?: string; contentText?: string },
  ) {
    const chapter = await this.prisma.projectChapter.findFirst({
      where: { id: chapterId, project: { id: projectId, userId } },
    });
    if (!chapter) throw new NotFoundException('CHAPTER_NOT_FOUND');

    const updated = await this.prisma.projectChapter.update({
      where: { id: chapterId },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.contentText !== undefined
          ? {
              contentText: data.contentText,
              wordCount: this.countWords(data.contentText),
            }
          : {}),
      },
    });

    await this.recountProjectWords(projectId);
    return updated;
  }

  /** DELETE /projects/:id/chapters/:chapterId */
  async removeChapter(
    userId: string,
    projectId: string,
    chapterId: string,
  ) {
    const chapter = await this.prisma.projectChapter.findFirst({
      where: { id: chapterId, project: { id: projectId, userId } },
    });
    if (!chapter) throw new NotFoundException('CHAPTER_NOT_FOUND');

    await this.prisma.projectChapter.delete({ where: { id: chapterId } });
    await this.recountProjectWords(projectId);
  }

  // ── Helpers ──

  private async ensureOwned(userId: string, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('PROJECT_NOT_FOUND');
  }

  /** Recompute wordCountTotal from chapters after any chapter change. */
  private async recountProjectWords(projectId: string) {
    const agg = await this.prisma.projectChapter.aggregate({
      where: { projectId },
      _sum: { wordCount: true },
    });
    await this.prisma.project.update({
      where: { id: projectId },
      data: { wordCountTotal: agg._sum.wordCount ?? 0 },
    });
  }

  private countWords(text: string): number {
    const trimmed = text.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
  }
}
