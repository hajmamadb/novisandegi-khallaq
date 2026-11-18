import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { QueueService } from '../../queues/queue.service';
import { requestContextStorage } from '../../common/context/request-context';
import { LogEventDto } from './dto/log-event.dto';

export interface ListMyEventsQuery {
  /** 1-based page number (default 1). */
  page?: number;
  /** Rows per page (default 50, max 200). */
  limit?: number;
  /** Filter by event name, e.g. 'session_started'. */
  eventName?: string;
}

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  /**
   * Resolve IP/UA hashes: explicit meta wins, otherwise fall back to the
   * AsyncLocalStorage request context (populated by RequestContextMiddleware).
   */
  private resolveClientMeta(
    meta?: { ipHash?: string; userAgentHash?: string },
  ): { ipHash?: string; userAgentHash?: string } {
    const stored = requestContextStorage.getStore();
    return {
      ipHash: meta?.ipHash ?? stored?.ipHash,
      userAgentHash: meta?.userAgentHash ?? stored?.userAgentHash,
    };
  }

  /**
   * Append an event to the user's log (spec D.7 — append-only, no UPDATE/DELETE).
   * Returns the persisted row so the client can confirm the write.
   */
  async log(
    userId: string,
    dto: LogEventDto,
    meta?: { ipHash?: string; userAgentHash?: string },
  ) {
    const clientMeta = this.resolveClientMeta(meta);
    const event = await this.prisma.eventLog.create({
      data: {
        userId,
        eventName: dto.eventName,
        eventPayloadJson: (dto.eventPayloadJson ?? {}) as Prisma.InputJsonValue,
        sessionType: dto.sessionType,
        sessionId: dto.sessionId,
        clientTimestamp: dto.clientTimestamp ? new Date(dto.clientTimestamp) : null,
        ipHash: clientMeta.ipHash,
        userAgentHash: clientMeta.userAgentHash,
      },
    });

    // DECISION: badge rules are evaluated asynchronously off the hot path.
    // The event is persisted first, then the job is enqueued. If the enqueue
    // fails, the event is still recorded — the badge engine is best-effort
    // and can be re-run by an admin reconciliation later.
    await this.enqueueBadgeEvaluation(userId, event.id);
    return event;
  }

  /** List the user's own events, newest first, paginated. */
  async listMine(userId: string, query: ListMyEventsQuery) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(200, Math.max(1, query.limit ?? 50));
    const where = {
      userId,
      ...(query.eventName ? { eventName: query.eventName } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.eventLog.findMany({
        where,
        orderBy: { serverTimestamp: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.eventLog.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  /**
   * Programmatic logging used by other services (e.g. auth, sessions).
   * Mirrors log() but takes a plain object so callers don't build a DTO.
   *
   * IP/UA: if not passed explicitly via `meta`, the values are read from the
   * AsyncLocalStorage request context (set by RequestContextMiddleware), so
   * every server-side event automatically carries the client's hashed IP/UA.
   */
  async logRaw(
    userId: string,
    eventName: string,
    payload?: Record<string, unknown>,
    meta?: { ipHash?: string; userAgentHash?: string; sessionType?: string; sessionId?: string },
  ) {
    const clientMeta = this.resolveClientMeta(meta);
    const event = await this.prisma.eventLog.create({
      data: {
        userId,
        eventName,
        eventPayloadJson: (payload ?? {}) as Prisma.InputJsonValue,
        sessionType: meta?.sessionType,
        sessionId: meta?.sessionId,
        ipHash: clientMeta.ipHash,
        userAgentHash: clientMeta.userAgentHash,
      },
    });
    await this.enqueueBadgeEvaluation(userId, event.id);
    return event;
  }

  private async enqueueBadgeEvaluation(userId: string, eventId: string) {
    try {
      await this.queue.enqueue('badge-evaluate', { userId, eventId });
    } catch (err) {
      // DECISION: log-and-continue — a queue outage must not 500 the request.
      // The event is already persisted; badge evaluation can be reconciled.
      console.error('[events] failed to enqueue badge-evaluate', err);
    }
  }
}
