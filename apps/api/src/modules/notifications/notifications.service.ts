import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /notifications — newest first, unread first within same day. */
  list(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      select: {
        id: true,
        type: true,
        titleFa: true,
        bodyFa: true,
        readAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /** GET /notifications/unread-count — for the topbar badge. */
  unreadCount(userId: string) {
    return this.prisma.notification
      .count({ where: { userId, readAt: null } })
      .then((count) => ({ count }));
  }

  /** POST /notifications/:id/read */
  async markRead(userId: string, id: string) {
    return this.prisma.notification
      .updateMany({
        where: { id, userId, readAt: null },
        data: { readAt: new Date() },
      })
      .then(() => ({ ok: true }));
  }

  /** POST /notifications/read-all */
  async markAllRead(userId: string) {
    return this.prisma.notification
      .updateMany({
        where: { userId, readAt: null },
        data: { readAt: new Date() },
      })
      .then((res) => ({ updated: res.count }));
  }
}
