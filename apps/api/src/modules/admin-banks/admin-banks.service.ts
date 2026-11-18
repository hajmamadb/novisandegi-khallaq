import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BankType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { delegateFor } from '../banks/selectors/selector.util';

/**
 * Dynamic Prisma delegate accessor. We use `any` here because the 10+ bank
 * models have different column sets and Prisma does not expose a single
 * generic type. The column set is validated by the Prisma runtime on write.
 */
type Delegate = {
  findMany: (args: Record<string, unknown>) => Promise<unknown[]>;
  findUnique: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  create: (args: Record<string, unknown>) => Promise<unknown>;
  update: (args: Record<string, unknown>) => Promise<unknown>;
  delete: (args: Record<string, unknown>) => Promise<unknown>;
};

/**
 * Admin CRUD for all content banks. Handles the three special cases:
 * - NEWS: uses `status` instead of `approvalStatus`
 * - WORD / STRUCTURE_TEMPLATE: no approval field at all
 * - Most banks: `approvalStatus` field, `APPROVED` on admin create
 */
@Injectable()
export class AdminBanksService {
  constructor(private readonly prisma: PrismaService) {}

  private delegate(bankType: string): Delegate {
    // The frontend sends BankType enum values (e.g. 'CHARACTER').
    // Cast to BankType so delegateFor() validates it.
    // delegateFor returns keyof PrismaClient which includes symbol keys,
    // so we cast to string for safe indexing.
    const key = delegateFor(bankType as BankType) as string;
    const d = (this.prisma as unknown as Record<string, Delegate>)[key];
    if (!d) throw new BadRequestException(`UNKNOWN_BANK:${bankType}`);
    return d;
  }

  // ── LIST ──

  /** GET admin/banks/:bankType — all items, all statuses, limit 200. */
  list(bankType: string) {
    const d = this.delegate(bankType);
    return d.findMany({
      take: 200,
      orderBy: { id: 'asc' },
    });
  }

  // ── CREATE ──

  /**
   * POST admin/banks/:bankType — create a new item.
   * Admin-created items are auto-approved (APPROVED status).
   */
  async create(bankType: string, body: Record<string, unknown>, actorId: string) {
    const d = this.delegate(bankType);

    const data: Record<string, unknown> = { ...body };

    // Special-case: NEWS uses `status`, not `approvalStatus`.
    if (bankType === 'NEWS') {
      if (data.status === undefined) data.status = 'APPROVED';
    } else if (bankType === 'WORD' || bankType === 'STRUCTURE_TEMPLATE') {
      // No approval field — nothing to set.
    } else {
      // Most banks: auto-approve admin-created items.
      if (data.approvalStatus === undefined) data.approvalStatus = 'APPROVED';
    }

    // Coerce comma-separated arrays (tags, synonyms, semanticTags).
    for (const key of ['tags', 'synonyms', 'semanticTags']) {
      if (typeof data[key] === 'string') {
        data[key] = (data[key] as string)
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean);
      }
    }

    const result = await d.create({ data });
    this.audit(actorId, bankType, (result as Record<string, unknown>).id as string, 'CREATE');
    return result;
  }

  // ── UPDATE ──

  /** PATCH admin/banks/:bankType/:id — partial update. */
  async update(
    bankType: string,
    id: string,
    body: Record<string, unknown>,
    actorId: string,
  ) {
    const d = this.delegate(bankType);

    const existing = await d.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('BANK_ITEM_NOT_FOUND');

    const data: Record<string, unknown> = { ...body };

    // Coerce comma-separated arrays.
    for (const key of ['tags', 'synonyms', 'semanticTags']) {
      if (typeof data[key] === 'string') {
        data[key] = (data[key] as string)
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean);
      }
    }

    const result = await d.update({ where: { id }, data });
    this.audit(actorId, bankType, id, 'UPDATE');
    return result;
  }

  // ── TOGGLE ACTIVE ──

  /** PATCH admin/banks/:bankType/:id/toggle-active — toggle active status. */
  async toggleActive(bankType: string, id: string, actorId: string) {
    const d = this.delegate(bankType);

    const existing = (await d.findUnique({ where: { id } })) as Record<string, unknown> | null;
    if (!existing) throw new NotFoundException('BANK_ITEM_NOT_FOUND');

    let data: Record<string, unknown>;
    if (bankType === 'NEWS') {
      const current = existing.status;
      data = { status: current === 'APPROVED' ? 'REJECTED' : 'APPROVED' };
    } else {
      const current = existing.isActive !== false;
      data = { isActive: !current };
    }

    const result = await d.update({ where: { id }, data });
    this.audit(actorId, bankType, id, 'TOGGLE_ACTIVE');
    return result;
  }

  // ── DELETE ──

  /** DELETE admin/banks/:bankType/:id — hard delete. */
  async remove(bankType: string, id: string, actorId: string) {
    const d = this.delegate(bankType);

    const existing = await d.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('BANK_ITEM_NOT_FOUND');

    const result = await d.delete({ where: { id } });
    this.audit(actorId, bankType, id, 'DELETE');
    return result;
  }

  // ── AUDIT ──

  /**
   * Fire-and-forget audit log. A failed audit must not block the mutation
   * (same pattern as admin-approvals.service.ts).
   */
  private audit(actorId: string, bankType: string, id: string, action: string) {
    const data: Prisma.AuditLogCreateInput = {
      actorId,
      action,
      targetType: bankType.toLowerCase(),
      targetId: id,
      reason: `admin-banks:${action}`,
    };
    this.prisma.auditLog.create({ data }).catch(() => {});
  }
}
