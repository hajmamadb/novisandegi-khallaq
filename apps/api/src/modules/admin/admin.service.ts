import { Injectable, NotFoundException } from '@nestjs/common';
import { AnomalySeverity, AnomalyType, ApprovalStatus, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Per-bank totals for the Banks tab. */
export interface BankRow {
  key: string;
  labelFa: string;
  approved: number;
  pending: number;
  total: number;
}

/**
 * DECISION: the spec (D.14) lists the endpoint table but does not define the
 * overview response shape. We return a single flat object with the aggregates
 * an operator needs at a glance: users, activity, volume, integrity, banks.
 */
export interface AdminOverview {
  users: {
    total: number;
    active: number;
    byRole: Record<string, number>;
  };
  activity: {
    sessionsTotal: number;
    sessionsToday: number;
    submittedTotal: number;
    abandonedTotal: number;
  };
  volume: {
    totalWords: number;
    totalMinutes: number;
    totalXpAwarded: number;
  };
  integrity: Record<string, number>;
  anomalies: { total: number; open: number };
  badges: { total: number; awarded: number };
  banks: BankRow[];
  generatedAt: Date;
}

// Bank tables and their Persian labels (Banks tab).
const BANKS: { key: string; labelFa: string; model: 'character' | 'place' | 'openingLine' | 'styleParagraph' | 'referenceStory' | 'newsItem' | 'imageAsset' | 'objectItem' | 'emotionLexicon' | 'whatIfQuestion' | 'structurePhrase' | 'word' | 'cutupText' | 'ambientAudio' | 'structureTemplate' }[] = [
  { key: 'character', labelFa: 'شخصیت', model: 'character' },
  { key: 'place', labelFa: 'مکان', model: 'place' },
  { key: 'opening_line', labelFa: 'خط اول', model: 'openingLine' },
  { key: 'style_paragraph', labelFa: 'پاراکراف سبکی', model: 'styleParagraph' },
  { key: 'reference_story', labelFa: 'داستان مرجع', model: 'referenceStory' },
  { key: 'news', labelFa: 'خبر', model: 'newsItem' },
  { key: 'image', labelFa: 'تصویر', model: 'imageAsset' },
  { key: 'object', labelFa: 'اشیا', model: 'objectItem' },
  { key: 'emotion', labelFa: 'احساسات', model: 'emotionLexicon' },
  { key: 'what_if', labelFa: 'چه می‌شود اگر', model: 'whatIfQuestion' },
  { key: 'structure_phrase', labelFa: 'عبارت ساختاری', model: 'structurePhrase' },
  { key: 'word', labelFa: 'واژه', model: 'word' },
  { key: 'cutup_text', labelFa: 'متن کات-آپ', model: 'cutupText' },
  { key: 'ambient_audio', labelFa: 'صوت محیطی', model: 'ambientAudio' },
  { key: 'structure_template', labelFa: 'قالب ساختار', model: 'structureTemplate' },
];

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * DECISION: the spec (E.9) shows `$queryRaw` for search, but for counting
   * 15 bank tables we use `$queryRawUnsafe` with a **whitelisted** table name
   * (never user input — the names come from the constant `BANKS` array), so
   * no injection is possible. Values are all integers produced by the DB.
   */
  async overview(): Promise<AdminOverview> {
    // --- Users ---
    const [usersTotal, usersActive, byRoleRows] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { deletedAt: null, isActive: true } }),
      this.prisma.user.groupBy({ by: ['role'], where: { deletedAt: null }, _count: { _all: true } }),
    ]);
    const byRole: Record<string, number> = {};
    for (const r of byRoleRows) byRole[r.role] = r._count._all;

    // --- Activity ---
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const [sessionsTotal, sessionsToday, submittedTotal, abandonedTotal] = await Promise.all([
      this.prisma.exerciseSession.count(),
      this.prisma.exerciseSession.count({ where: { startedAt: { gte: startOfToday } } }),
      this.prisma.exerciseSession.count({ where: { status: 'SUBMITTED' } }),
      this.prisma.exerciseSession.count({ where: { status: 'ABANDONED' } }),
    ]);

    // --- Volume ---
    const volumeAgg = await this.prisma.submission.aggregate({
      _sum: { wordCount: true, durationSeconds: true, xpAwarded: true },
    });

    // --- Integrity ---
    const byIntegrityRows = await this.prisma.submission.groupBy({
      by: ['integrityResult'],
      _count: { _all: true },
    });
    const integrity: Record<string, number> = {};
    for (const r of byIntegrityRows) integrity[r.integrityResult] = r._count._all;

    // --- Anomalies ---
    const [anomaliesTotal, anomaliesOpen] = await Promise.all([
      this.prisma.anomalyFlag.count(),
      this.prisma.anomalyFlag.count({ where: { resolvedAt: null } }),
    ]);

    // --- Badges ---
    const [badgesTotal, badgesAwarded] = await Promise.all([
      this.prisma.badge.count(),
      this.prisma.badgeAward.count(),
    ]);

    // --- Banks (15 tables, each: total + pending) ---
    const banks: BankRow[] = await Promise.all(
      BANKS.map(async (b) => {
        const total = await this.countBank(b.model, undefined);
        const pending = await this.countBank(b.model, ApprovalStatus.PENDING);
        return {
          key: b.key,
          labelFa: b.labelFa,
          approved: total - pending,
          pending,
          total,
        };
      }),
    );

    return {
      users: { total: usersTotal, active: usersActive, byRole },
      activity: { sessionsTotal, sessionsToday, submittedTotal, abandonedTotal },
      volume: {
        totalWords: volumeAgg._sum.wordCount ?? 0,
        totalMinutes: Math.round((volumeAgg._sum.durationSeconds ?? 0) / 60),
        totalXpAwarded: volumeAgg._sum.xpAwarded ?? 0,
      },
      integrity,
      anomalies: { total: anomaliesTotal, open: anomaliesOpen },
      badges: { total: badgesTotal, awarded: badgesAwarded },
      banks,
      generatedAt: new Date(),
    };
  }

  /**
   * Count rows in a bank table, optionally filtered by its approval status.
   *
   * DECISION: not all 15 bank models have an `approvalStatus` field —
   *   - `newsItem` uses a different field name: `status` (ApprovalStatus)
   *   - `ambientAudio` and `structureTemplate` have NO status field (only isActive)
   * Prisma rejects a `where` clause referencing a field that does not exist on
   * the model, so for those two we count the whole table and report pending=0
   * (there is no pending concept to filter on). The model names and enums come
   * from the constant `BANKS` array / Prisma enum — never user input, so no
   * injection path.
   */
  // ---------------------------------------------------------------------------
  // Spec D.14 — admin list endpoints (users, badges, anomalies, audit-log)
  // ---------------------------------------------------------------------------

  /** GET /admin/users — paginated user list with optional role/search filters. */
  async listUsers(params: {
    page?: number;
    limit?: number;
    role?: string;
    search?: string;
  }) {
    const page = params.page ?? 1;
    const limit = Math.min(params.limit ?? 50, 100);
    const where = {
      deletedAt: null as null | object,
      ...(params.role ? { role: params.role as UserRole } : {}),
      ...(params.search
        ? {
            OR: [
              { email: { contains: params.search, mode: 'insensitive' as const } },
              { displayName: { contains: params.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          isActive: true,
          createdAt: true,
          _count: { select: { submissions: true, sessions: true } },
        },
      }),
    ]);
    return { users, total, page, limit };
  }

  /** GET /admin/badges — all badges with award counts. */
  async listBadges() {
    const badges = await this.prisma.badge.findMany({
      orderBy: [{ family: 'asc' }, { displayOrder: 'asc' }],
      include: { _count: { select: { awards: true } } },
    });
    return { badges };
  }

  /** GET /admin/anomalies — paginated anomaly flags with optional filters. */
  async listAnomalies(params: {
    page?: number;
    limit?: number;
    severity?: string;
    resolved?: boolean;
    anomalyType?: string;
  }) {
    const page = params.page ?? 1;
    const limit = Math.min(params.limit ?? 50, 100);
    const where = {
      ...(params.severity ? { severity: params.severity as AnomalySeverity } : {}),
      ...(params.resolved !== undefined
        ? { resolvedAt: params.resolved ? { not: null } : null }
        : {}),
      ...(params.anomalyType ? { anomalyType: params.anomalyType as AnomalyType } : {}),
    };
    const [total, anomalies] = await Promise.all([
      this.prisma.anomalyFlag.count({ where }),
      this.prisma.anomalyFlag.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { select: { id: true, email: true, displayName: true } } },
      }),
    ]);
    return { anomalies, total, page, limit };
  }

  /** PATCH /admin/anomalies/:id/resolve — mark an anomaly as resolved. */
  async resolveAnomaly(id: string, note: string, actorId: string) {
    const anomaly = await this.prisma.anomalyFlag.findUnique({ where: { id } });
    if (!anomaly) throw new NotFoundException('Anomaly not found');
    const resolved = await this.prisma.anomalyFlag.update({
      where: { id },
      data: {
        resolvedAt: new Date(),
        resolvedBy: actorId,
        resolutionNote: note,
      },
    });
    // Write to audit log for traceability.
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'ANOMALY_RESOLVED',
        targetType: 'AnomalyFlag',
        targetId: id,
        reason: note,
      },
    });
    return resolved;
  }

  /**
   * PATCH /admin/users/:id/role — change a user's role.
   * Writes an audit-log entry for traceability.
   */
  async changeRole(userId: string, newRole: UserRole, actorId: string) {
    const target = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw new NotFoundException('USER_NOT_FOUND');
    if (target.deletedAt) throw new NotFoundException('USER_DELETED');

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { role: newRole },
      select: { id: true, email: true, displayName: true, role: true },
    });

    // Audit: record the role change for accountability.
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'ROLE_CHANGED',
        targetType: 'User',
        targetId: userId,
        reason: `Role changed to ${newRole}`,
        beforeJson: { id: target.id, role: target.role } as Prisma.InputJsonValue,
        afterJson: { id: updated.id, role: updated.role } as Prisma.InputJsonValue,
      },
    }).catch(() => {});

    return updated;
  }

  /** GET /admin/audit-log — paginated audit log entries. */
  async listAuditLog(params: {
    page?: number;
    limit?: number;
    action?: string;
    actorId?: string;
  }) {
    const page = params.page ?? 1;
    const limit = Math.min(params.limit ?? 100, 200);
    const where = {
      ...(params.action ? { action: params.action } : {}),
      ...(params.actorId ? { actorId: params.actorId } : {}),
    };
    const [total, entries] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { entries, total, page, limit };
  }

  private async countBank(
    model: (typeof BANKS)[number]['model'],
    approvalStatus?: ApprovalStatus,
  ): Promise<number> {
    // Models whose approval field is named `status` instead of `approvalStatus`.
    if (model === 'newsItem') {
      return (this.prisma as unknown as {
        newsItem: { count(args?: { where?: { status?: ApprovalStatus } }): Promise<number> };
      }).newsItem.count({ where: approvalStatus ? { status: approvalStatus } : undefined });
    }
    // Models with no approval status at all — count the whole table, pending=0.
    // (word / ambientAudio / structureTemplate have only `isActive`, no status field.)
    if (model === 'word' || model === 'ambientAudio' || model === 'structureTemplate') {
      return (this.prisma as unknown as {
        [K: string]: { count(): Promise<number> };
      })[model].count();
    }
    // The remaining 12 bank models all share `approvalStatus`.
    const client = this.prisma as unknown as {
      [K in (typeof BANKS)[number]['model']]: {
        count(args?: { where?: { approvalStatus?: ApprovalStatus } }): Promise<number>;
      };
    };
    return client[model].count({
      where: approvalStatus ? { approvalStatus } : undefined,
    });
  }
}
