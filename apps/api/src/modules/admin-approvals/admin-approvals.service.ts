import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * A single pending item, normalized across the different source models so
 * the admin UI can render one queue regardless of where it came from.
 */
interface PendingItem {
  source: string; // 'news' | bank delegate key
  id: string;
  title: string;
  summary: string;
  status: string;
  meta?: Record<string, unknown>;
  createdAt?: Date;
}

@Injectable()
export class AdminApprovalsService {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /admin/approvals — every PENDING item across News + banks. */
  async list() {
    const items: PendingItem[] = [];

    // News uses a `status` field; bank content models use `approvalStatus`.
    const news = await this.prisma.newsItem.findMany({
      where: { status: ApprovalStatus.PENDING },
      orderBy: { publishedAt: 'desc' },
      take: 100,
    });
    for (const n of news) {
      items.push({
        source: 'news',
        id: n.id,
        title: n.title,
        summary: n.summary,
        status: n.status,
        meta: { sourceName: n.sourceName, category: n.category },
        createdAt: n.publishedAt,
      });
    }

    // Bank content — only models that carry an approvalStatus field.
    const bankModels: {
      key: string;
      field: string;
      summaryField?: string;
    }[] = [
      { key: 'character', field: 'name', summaryField: 'background' },
      { key: 'place', field: 'name', summaryField: 'description' },
      { key: 'openingLine', field: 'text' },
      { key: 'imageAsset', field: 'description', summaryField: 'topic' },
      { key: 'objectItem', field: 'name', summaryField: 'description' },
      { key: 'emotionLexicon', field: 'word', summaryField: 'emotion' },
    ];

    for (const spec of bankModels) {
      try {
        const delegate: any = (this.prisma as any)[spec.key];
        // Probe the model's field set so we only orderBy a column that exists.
        // delegate.fields is an object keyed by field name on the generated
        // client. Character / Place / ImageAsset have `createdAt`; OpeningLine,
        // ObjectItem and EmotionLexicon do NOT — orderBy on a missing column
        // throws a Prisma validation error (which the outer catch would
        // silently swallow and surface as a 500 to the admin UI).
        const fields: Record<string, unknown> = delegate.fields ?? {};
        const orderBy: Record<string, unknown> = 'createdAt' in fields
          ? { createdAt: 'desc' }
          : { id: 'desc' };
        const rows = await delegate.findMany({
          where: { approvalStatus: ApprovalStatus.PENDING },
          orderBy,
          take: 100,
        });
        for (const r of rows) {
          const title =
            (r[spec.field] as string) ??
            (r.description as string) ??
            (r.line as string) ??
            r.id;
          items.push({
            source: spec.key,
            id: r.id,
            title,
            summary:
              (spec.summaryField ? r[spec.summaryField] : null) ??
              (r.description as string) ??
              (r.definition as string) ??
              '',
            status: r.approvalStatus,
            // Model may not have a createdAt column (OpeningLine/ObjectItem/
            // EmotionLexicon) — fall back to now() only for sort ordering;
            // the UI renders title/summary/status which are always present.
            createdAt: (r.createdAt as Date) ?? new Date(),
          });
        }
      } catch {
        // Model not present in this Prisma client build — skip, not fatal.
      }
    }

    items.sort(
      (a, b) =>
        new Date(b.createdAt ?? 0).getTime() -
        new Date(a.createdAt ?? 0).getTime(),
    );
    return { items };
  }

  /**
   * POST /admin/approvals/:source/:id/approve|reject
   * `source` is 'news' or a bank delegate key.
   */
  async decide(
    source: string,
    id: string,
    decision: 'approve' | 'reject',
    actorId: string,
  ) {
    const status =
      decision === 'approve'
        ? ApprovalStatus.APPROVED
        : ApprovalStatus.REJECTED;

    if (source === 'news') {
      const res = await this.prisma.newsItem.updateMany({
        where: { id, status: ApprovalStatus.PENDING },
        data: { status },
      });
      if (res.count === 0) {
        throw new NotFoundException('ITEM_NOT_PENDING');
      }
      this.audit(actorId, source, id, decision);
      return { ok: true, status };
    }

    // Bank content models use `approvalStatus`.
    const delegate: any = (this.prisma as any)[source];
    if (!delegate) throw new BadRequestException(`UNKNOWN_SOURCE:${source}`);
    const res = await delegate.updateMany({
      where: { id, approvalStatus: ApprovalStatus.PENDING },
      data: { approvalStatus: status },
    });
    if (res.count === 0) {
      throw new NotFoundException('ITEM_NOT_PENDING');
    }
    this.audit(actorId, source, id, decision);
    return { ok: true, status };
  }

  private audit(actorId: string, source: string, id: string, decision: string) {
    // Fire-and-forget: a failed audit must not block the decision.
    const data: Prisma.AuditLogCreateInput = {
      actorId,
      action: decision === 'approve' ? 'APPROVE' : 'REJECT',
      targetType: source,
      targetId: id,
      reason: `admin-approvals:${decision}`,
    };
    this.prisma.auditLog.create({ data }).catch(() => {});
  }
}
