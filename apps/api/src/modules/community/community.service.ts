import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FeedbackTargetKind } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsService } from '../events/events.service';

@Injectable()
export class CommunityService {
  // DECISION: in-process per-user rolling window of served daily-news ids
  // (the "no repeat" for /community/news/today). Resets on restart — see the
  // dailyNews() DECISION for the trade-off and the future migration path.
  private readonly seenByUser = new Map<string, string[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  // ── News (community feed) ──

  /** GET /community/news — approved, non-sensitive news, newest first. */
  listNews() {
    return this.prisma.newsItem.findMany({
      where: { status: 'APPROVED', isSensitive: false },
      select: {
        id: true,
        title: true,
        summary: true,
        sourceName: true,
        category: true,
        publishedAt: true,
      },
      orderBy: { publishedAt: 'desc' },
      take: 50,
    });
  }

  /**
   * GET /community/news/today — the day's per-user selection, without repeat.
   *
   * Spec: "For each user, the day's news without repetition." A user's daily
   * page should surface fresh items each day and not re-show what they saw.
   *
   * DECISION: no read-tracking table exists in the schema (locked stack; the
   * only "history" model is exercise sessions), and a per-user NewsRead table
   * would need a Prisma migration — invasive for phase 1. So "without
   * repetition" is an in-process rolling window: a per-user LRU of news ids
   * served on the daily page. Consecutive /news/today calls for the same user
   * never repeat an item until the window wraps. Trade-off: the window resets
   * on API restart (acceptable — the newest-first feed naturally re-serves
   * current items, and the 6h cron keeps adding fresh ones). A persistent
   * per-user read store can replace this later without changing the route.
   */
  async dailyNews(userId: string, limit = 20) {
    const seenIds = this.seenByUser.get(userId) ?? [];

    // Pull a candidate pool wider than the window so we can exclude seen items.
    const pool = await this.prisma.newsItem.findMany({
      where: { status: 'APPROVED', isSensitive: false },
      select: {
        id: true,
        title: true,
        summary: true,
        sourceName: true,
        category: true,
        publishedAt: true,
      },
      orderBy: { publishedAt: 'desc' },
      take: Math.min(limit + seenIds.length + 20, 100),
    });

    const fresh = pool.filter((n) => !seenIds.includes(n.id));
    const items = fresh.slice(0, limit);

    // Remember what we served so the next call excludes it (rolling window).
    const nextSeen = [...items.map((n) => n.id), ...seenIds].slice(0, 100);
    this.seenByUser.set(userId, nextSeen);

    return { items, date: new Date().toISOString().slice(0, 10) };
  }

  // ── Feedback (peer review) ──

  /** POST /community/feedback — leave a review on someone's work. */
  async createFeedback(
    reviewerId: string,
    data: {
      authorId: string;
      targetKind: FeedbackTargetKind;
      targetId: string;
      content: string;
      rating?: number;
    },
  ) {
    if (reviewerId === data.authorId) {
      throw new BadRequestException('SELF_REVIEW_NOT_ALLOWED');
    }
    if (data.rating !== undefined && (data.rating < 1 || data.rating > 5)) {
      throw new BadRequestException('RATING_OUT_OF_RANGE');
    }
    const feedback = await this.prisma.feedback.create({
      data: {
        reviewerId,
        authorId: data.authorId,
        targetKind: data.targetKind,
        targetId: data.targetId,
        content: data.content,
        rating: data.rating,
      },
    });

    // Fire-and-forget: log the feedback event for analytics.
    this.events.logRaw(reviewerId, 'feedback_submitted', {
      feedbackId: feedback.id,
      authorId: data.authorId,
      targetKind: data.targetKind,
      targetId: data.targetId,
      rating: data.rating,
    });

    return feedback;
  }

  /** GET /community/feedback — feedback where the user is author or reviewer. */
  listFeedback(userId: string) {
    return this.prisma.feedback.findMany({
      where: { OR: [{ authorId: userId }, { reviewerId: userId }] },
      select: {
        id: true,
        targetKind: true,
        targetId: true,
        content: true,
        rating: true,
        createdAt: true,
        author: { select: { id: true, displayName: true } },
        reviewer: { select: { id: true, displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  // ── Exquisite corpse (جسد نفیس) ──

  /** POST /community/corpse/start — open a new chain. */
  startChain() {
    return this.prisma.exquisiteCorpseChain.create({
      data: { status: 'OPEN', round: 1, maxRounds: 5 },
    });
  }

  /** GET /community/corpse/:id — chain with all segments. */
  async getChain(id: string) {
    const chain = await this.prisma.exquisiteCorpseChain.findUnique({
      where: { id },
      include: {
        segments: {
          orderBy: { round: 'asc' },
          select: {
            id: true,
            segmentText: true,
            round: true,
            author: { select: { id: true, displayName: true } },
          },
        },
      },
    });
    if (!chain) throw new NotFoundException('CHAIN_NOT_FOUND');
    return chain;
  }

  /** GET /community/corpse — currently open chains. */
  listOpenChains() {
    return this.prisma.exquisiteCorpseChain.findMany({
      where: { status: 'OPEN' },
      include: { _count: { select: { segments: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  /**
   * POST /community/corpse/:id/add — append the next segment.
   * Round increments after each contribution; the chain closes at maxRounds.
   */
  async addSegment(chainId: string, authorId: string, segmentText: string) {
    const chain = await this.prisma.exquisiteCorpseChain.findUnique({
      where: { id: chainId },
      include: { segments: true },
    });
    if (!chain) throw new NotFoundException('CHAIN_NOT_FOUND');
    if (chain.status !== 'OPEN') {
      throw new BadRequestException('CHAIN_CLOSED');
    }
    // DECISION: the same author may not write twice in one chain.
    const alreadyPlayed = chain.segments.some((s) => s.authorId === authorId);
    if (alreadyPlayed) {
      throw new BadRequestException('ALREADY_CONTRIBUTED');
    }

    const isLast = chain.round >= chain.maxRounds;
    const link = await this.prisma.exquisiteCorpseLink.create({
      data: {
        chainId,
        authorId,
        segmentText,
        round: chain.round,
      },
    });
    if (isLast) {
      await this.prisma.exquisiteCorpseChain.update({
        where: { id: chainId },
        data: { status: 'CLOSED' },
      });
    } else {
      await this.prisma.exquisiteCorpseChain.update({
        where: { id: chainId },
        data: { round: chain.round + 1 },
      });
    }
    return link;
  }
}
