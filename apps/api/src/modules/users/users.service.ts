import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

// DECISION: UsersService owns the user profile surface — GET/PATCH /users/me,
// GET /users/me/export. The auth module keeps its own AuthUserResponse; the
// full user object (including settingsJson) lives here.
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /users/me — full profile including settings and stats. */
  async getMe(userId: string): Promise<Record<string, unknown>> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { userStats: true },
    });
    if (!user || !user.isActive || user.deletedAt) {
      throw new NotFoundException('USER_NOT_FOUND');
    }
    const stats = user.userStats;
    return {
      ...this.toPublicUser(user),
      xpTotal: stats?.xpTotal ?? 0,
      currentStreak: stats?.currentStreak ?? 0,
      bestStreak: stats?.bestStreak ?? 0,
    };
  }

  /** PATCH /users/me — update displayName and/or settingsJson. */
  async updateMe(
    userId: string,
    dto: { displayName?: string; settingsJson?: Record<string, unknown> },
  ): Promise<Record<string, unknown>> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive || user.deletedAt) {
      throw new NotFoundException('USER_NOT_FOUND');
    }

    // DECISION: shallow-merge settings — only keys the client sends are
    // overwritten; unspecified keys are preserved. This avoids the client
    // having to send the entire settings object on every tab change.
    const data: Record<string, unknown> = {};
    if (dto.displayName !== undefined) data.displayName = dto.displayName;
    if (dto.settingsJson !== undefined) {
      const current = (user.settingsJson ?? {}) as Record<string, unknown>;
      data.settingsJson = { ...current, ...dto.settingsJson };
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
    });

    // Log settings_changed event (spec: هر تغییر → EventLog settings_changed).
    if (dto.settingsJson !== undefined) {
      await this.prisma.eventLog.create({
        data: {
          userId,
          eventName: 'settings_changed',
          eventPayloadJson: { changedKeys: Object.keys(dto.settingsJson) },
        },
      });
    }

    return this.toPublicUser(updated);
  }

  /** GET /users/me/export — full data export (GDPR-style). */
  async exportMe(userId: string): Promise<Record<string, unknown>> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) {
      throw new NotFoundException('USER_NOT_FOUND');
    }

    const [sessions, submissions, badges, xpLedger, events, writings, projects, messages] =
      await Promise.all([
        this.prisma.exerciseSession.findMany({
          where: { userId },
          include: { exerciseType: true, drafts: true, submission: true },
        }),
        this.prisma.submission.findMany({ where: { userId } }),
        this.prisma.badgeAward.findMany({ where: { userId } }),
        this.prisma.xPLedger.findMany({ where: { userId } }),
        this.prisma.eventLog.findMany({ where: { userId }, take: 500 }),
        this.prisma.writing.findMany({ where: { userId, deletedAt: null } }),
        this.prisma.project.findMany({ where: { userId, deletedAt: null }, include: { chapters: true } }),
        this.prisma.message.findMany({
          where: { OR: [{ senderId: userId }, { recipientId: userId }] },
        }),
      ]);

    return {
      user: this.toPublicUser(user),
      sessions,
      submissions,
      badges,
      xpLedger,
      events,
      writings,
      projects,
      messages,
      exportedAt: new Date().toISOString(),
    };
  }

  /** DELETE /users/me — self-service account deletion (GDPR). */
  async deleteMe(userId: string): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) {
      throw new NotFoundException('USER_NOT_FOUND');
    }
    // DECISION: admins cannot self-delete — the platform needs at least one
    // operator. An admin must be deactivated by another admin.
    if (user.role === UserRole.ADMIN) {
      throw new ForbiddenException('ADMIN_CANNOT_SELF_DELETE');
    }

    // Log the event before the soft-delete so the record is preserved.
    await this.prisma.eventLog.create({
      data: {
        userId,
        eventName: 'account_deletion_requested',
        eventPayloadJson: {
          email: user.email,
          role: user.role,
          displayName: user.displayName,
        },
      },
    });

    // Fire-and-forget audit trail for admin visibility.
    const deleteAt = new Date();
    const deletedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { deletedAt: deleteAt, isActive: false },
      select: { id: true, isActive: true, deletedAt: true },
    });

    this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'ACCOUNT_SELF_DELETE',
        targetType: 'User',
        targetId: userId,
        reason: 'self-service deletion',
        beforeJson: {
          id: user.id,
          email: user.email,
          role: user.role,
          displayName: user.displayName,
          isActive: user.isActive,
        } as Prisma.InputJsonValue,
        afterJson: {
          id: deletedUser.id,
          isActive: deletedUser.isActive,
          deletedAt: deletedUser.deletedAt,
        } as Prisma.InputJsonValue,
      },
    }).catch(() => {});

    return { ok: true };
  }

  private toPublicUser(user: {
    id: string;
    email: string;
    displayName: string;
    role: string;
    level: number;
    emailVerified: boolean;
    settingsJson: unknown;
    createdAt: Date;
    updatedAt: Date;
    // DECISION: the userStats relation may be present (getMe includes it) or
    // absent (updateMe / exportMe don't); the spread in getMe handles it.
    userStats?: { xpTotal: number; currentStreak: number; bestStreak: number } | null;
  }): Record<string, unknown> {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      level: user.level,
      emailVerified: user.emailVerified,
      settingsJson: user.settingsJson,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
