import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsService } from '../events/events.service';

@Injectable()
export class WritingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  /** GET /writings — list the user's writings with optional filters. */
  list(
    userId: string,
    query: { folderId?: string; tag?: string; trash?: boolean },
  ) {
    const where: Prisma.WritingWhereInput = { userId };
    // DECISION: default view hides soft-deleted; trash=true shows only deleted.
    if (query.trash) {
      where.deletedAt = { not: null };
    } else {
      where.deletedAt = null;
    }
    if (query.folderId) where.folderId = query.folderId;
    // DECISION: Prisma's String[] has no "has" filter in 5.14 — filter in app.
    return this.prisma.writing.findMany({
      where,
      select: {
        id: true,
        title: true,
        wordCount: true,
        tags: true,
        status: true,
        folderId: true,
        projectId: true,
        sourceSessionId: true,
        createdAt: true,
        updatedAt: true,
        folder: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
    }).then((all) =>
      query.tag ? all.filter((w) => w.tags.includes(query.tag!)) : all,
    );
  }

  /** GET /writings/:id — full text; version history comes from /versions. */
  async get(userId: string, id: string) {
    const writing = await this.prisma.writing.findFirst({
      where: { id, userId, deletedAt: null },
      include: { folder: { select: { id: true, name: true } } },
    });
    if (!writing) throw new NotFoundException('WRITING_NOT_FOUND');
    return writing;
  }

  /** GET /writings/:id/versions — draft history of the linked session. */
  async versions(userId: string, id: string) {
    const writing = await this.prisma.writing.findFirst({
      where: { id, userId },
      select: { sourceSessionId: true },
    });
    if (!writing) throw new NotFoundException('WRITING_NOT_FOUND');
    if (!writing.sourceSessionId) return [];
    return this.prisma.draft.findMany({
      where: { sessionId: writing.sourceSessionId },
      select: {
        id: true,
        versionNumber: true,
        saveTrigger: true,
        wordCount: true,
        createdAt: true,
      },
      orderBy: { versionNumber: 'asc' },
    });
  }

  /** POST /writings — create from scratch or import a submission. */
  async create(
    userId: string,
    data: {
      title: string;
      contentText?: string;
      tags?: string[];
      folderId?: string;
      sourceSessionId?: string;
      projectId?: string;
    },
  ) {
    let contentText = data.contentText ?? '';
    let sourceSessionId = data.sourceSessionId;
    let title = data.title;

    // DECISION: importing from a session uses the session's final draft text.
    if (sourceSessionId) {
      const draft = await this.prisma.draft.findFirst({
        where: { sessionId: sourceSessionId, userId },
        orderBy: { versionNumber: 'desc' },
      });
      if (draft) {
        contentText = draft.contentText;
        if (!data.contentText) title = title || 'نوشتهٔ واردشده';
      }
    }

    return this.prisma.writing.create({
      data: {
        userId,
        title,
        contentText,
        wordCount: this.countWords(contentText),
        tags: data.tags ?? [],
        folderId: data.folderId,
        sourceSessionId,
        projectId: data.projectId,
      },
    });
  }

  /** POST /writings/:id/link-session — attach a session as the source. */
  async linkSession(userId: string, id: string, sessionId: string) {
    const writing = await this.prisma.writing.findFirst({
      where: { id, userId },
    });
    if (!writing) throw new NotFoundException('WRITING_NOT_FOUND');

    const draft = await this.prisma.draft.findFirst({
      where: { sessionId, userId },
      orderBy: { versionNumber: 'desc' },
    });
    if (!draft) throw new NotFoundException('SESSION_NOT_FOUND');

    return this.prisma.writing.update({
      where: { id },
      data: {
        sourceSessionId: sessionId,
        contentText: draft.contentText,
        wordCount: draft.wordCount,
      },
    });
  }

  /** PATCH /writings/:id */
  async update(
    userId: string,
    id: string,
    data: {
      title?: string;
      contentText?: string;
      tags?: string[];
      folderId?: string | null;
      status?: string;
    },
  ) {
    const writing = await this.prisma.writing.findFirst({
      where: { id, userId },
    });
    if (!writing) throw new NotFoundException('WRITING_NOT_FOUND');

    return this.prisma.writing.update({
      where: { id },
      data: {
        ...data,
        folderId: data.folderId === null ? null : data.folderId,
        ...(data.contentText !== undefined
          ? { wordCount: this.countWords(data.contentText) }
          : {}),
      },
    });
  }

  /** DELETE /writings/:id — soft delete (30-day trash). */
  async remove(userId: string, id: string) {
    const writing = await this.prisma.writing.findFirst({
      where: { id, userId, deletedAt: null },
      select: { id: true, title: true },
    });
    if (!writing) throw new NotFoundException('WRITING_NOT_FOUND');

    await this.prisma.writing.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    // Log the deletion event.
    await this.events.logRaw(userId, 'writing_deleted', {
      writingId: id,
      title: writing.title,
    });

    return { ok: true };
  }

  /** POST /writings/:id/restore — restore a soft-deleted writing. */
  async restore(userId: string, id: string) {
    const writing = await this.prisma.writing.findFirst({
      where: { id, userId, deletedAt: { not: null } },
      select: { id: true },
    });
    if (!writing) throw new NotFoundException('WRITING_NOT_FOUND');

    const restored = await this.prisma.writing.update({
      where: { id },
      data: { deletedAt: null },
    });

    await this.events.logRaw(userId, 'writing_restored', { writingId: id });
    return restored;
  }

  /** DELETE /writings/:id/permanent — hard delete (irreversible). */
  async permanentDelete(userId: string, id: string) {
    const writing = await this.prisma.writing.findFirst({
      where: { id, userId, deletedAt: { not: null } },
      select: { id: true, title: true },
    });
    if (!writing) throw new BadRequestException('NOT_IN_TRASH');

    await this.prisma.writing.delete({ where: { id } });

    // Audit trail for permanent (irreversible) deletion.
    this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'WRITING_PERMANENT_DELETE',
        targetType: 'Writing',
        targetId: id,
        reason: `title: ${writing.title}`,
        beforeJson: { id: writing.id, title: writing.title } as Prisma.InputJsonValue,
        afterJson: { deleted: true } as Prisma.InputJsonValue,
      },
    }).catch(() => {});

    await this.events.logRaw(userId, 'writing_permanently_deleted', {
      writingId: id,
      title: writing.title,
    });

    return { ok: true };
  }

  // ── Folders ──

  /** GET /writings/folders */
  listFolders(userId: string) {
    return this.prisma.writingFolder.findMany({
      where: { userId, deletedAt: null },
      select: {
        id: true,
        name: true,
        displayOrder: true,
        createdAt: true,
        _count: { select: { writings: true } },
      },
      orderBy: { displayOrder: 'asc' },
    });
  }

  /** POST /writings/folders */
  async createFolder(userId: string, name: string) {
    const count = await this.prisma.writingFolder.count({ where: { userId } });
    return this.prisma.writingFolder.create({
      data: { userId, name, displayOrder: count },
    });
  }

  /** DELETE /writings/folders/:id — soft delete; writings are kept (folderId → null). */
  async removeFolder(userId: string, id: string) {
    const folder = await this.prisma.writingFolder.findFirst({
      where: { id, userId, deletedAt: null },
      select: { id: true },
    });
    if (!folder) throw new NotFoundException('FOLDER_NOT_FOUND');
    return this.prisma.writingFolder.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /** POST /writings/folders/:id/restore — restore a soft-deleted folder. */
  async restoreFolder(userId: string, id: string) {
    const folder = await this.prisma.writingFolder.findFirst({
      where: { id, userId, deletedAt: { not: null } },
      select: { id: true },
    });
    if (!folder) throw new NotFoundException('FOLDER_NOT_FOUND');
    return this.prisma.writingFolder.update({
      where: { id },
      data: { deletedAt: null },
    });
  }

  private countWords(text: string): number {
    const trimmed = text.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
  }
}
