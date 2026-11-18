import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /messages/threads — one row per conversation partner, with the
   * latest message and unread count (messages where I am the recipient).
   */
  async listThreads(userId: string) {
    const sent = await this.prisma.message.groupBy({
      by: ['senderId'],
      where: { recipientId: userId },
      _count: { _all: true },
      _max: { createdAt: true },
    });
    const received = await this.prisma.message.groupBy({
      by: ['recipientId'],
      where: { senderId: userId },
      _count: { _all: true },
      _max: { createdAt: true },
    });
    const unread = await this.prisma.message.groupBy({
      by: ['senderId'],
      where: { recipientId: userId, readAt: null },
      _count: { _all: true },
    });
    const unreadMap = new Map(unread.map((u) => [u.senderId, u._count._all]));

    const partners = new Map<
      string,
      { lastAt: Date | null; messageCount: number; unread: number }
    >();
    for (const s of sent) {
      partners.set(s.senderId, {
        lastAt: s._max.createdAt ?? null,
        messageCount: s._count._all,
        unread: unreadMap.get(s.senderId) ?? 0,
      });
    }
    for (const r of received) {
      const existing = partners.get(r.recipientId);
      partners.set(r.recipientId, {
        lastAt: existing ? (existing.lastAt ?? r._max.createdAt) : r._max.createdAt,
        messageCount: (existing?.messageCount ?? 0) + r._count._all,
        unread: existing?.unread ?? 0,
      });
    }

    const partnerIds = [...partners.keys()];
    if (partnerIds.length === 0) return [];
    const users = await this.prisma.user.findMany({
      where: { id: { in: partnerIds } },
      select: { id: true, displayName: true, email: true, role: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    return [...partners.entries()]
      .map(([partnerId, info]) => ({
        participant: userMap.get(partnerId),
        lastMessageAt: info.lastAt,
        messageCount: info.messageCount,
        unreadCount: info.unread,
      }))
      .filter((t) => t.participant)
      .sort(
        (a, b) =>
          new Date(b.lastMessageAt ?? 0).getTime() -
          new Date(a.lastMessageAt ?? 0).getTime(),
      );
  }

  /**
   * GET /messages/threads/:participantId — the conversation, oldest first.
   * Marking incoming messages as read is a side effect (simpler UI,
   * single call).
   */
  async conversation(userId: string, participantId: string) {
    if (userId === participantId) {
      return [];
    }
    const or: Prisma.MessageWhereInput[] = [
      { senderId: userId, recipientId: participantId },
      { senderId: participantId, recipientId: userId },
    ];
    const messages = await this.prisma.message.findMany({
      where: { OR: or },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        body: true,
        createdAt: true,
        readAt: true,
        sender: { select: { id: true, displayName: true } },
      },
      take: 200,
    });
    // Mark the partner's messages as read.
    await this.prisma.message.updateMany({
      where: { senderId: participantId, recipientId: userId, readAt: null },
      data: { readAt: new Date() },
    });
    return messages;
  }

  /** POST /messages — send. */
  async send(
    senderId: string,
    recipientId: string,
    body: string,
  ) {
    if (senderId === recipientId) {
      throw new BadRequestException('SELF_MESSAGE_NOT_ALLOWED');
    }
    const recipient = await this.prisma.user.findUnique({
      where: { id: recipientId },
      select: { id: true },
    });
    if (!recipient) throw new NotFoundException('RECIPIENT_NOT_FOUND');
    return this.prisma.message.create({
      data: { senderId, recipientId, body },
    });
  }
}
