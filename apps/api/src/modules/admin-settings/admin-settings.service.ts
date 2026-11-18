import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AdminSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /admin/settings — all settings as a key→value map + raw list. */
  async list() {
    const rows = await this.prisma.systemSetting.findMany({
      orderBy: { key: 'asc' },
    });
    const map: Record<string, unknown> = {};
    for (const r of rows) map[r.key] = r.valueJson;
    return { settings: map, rows };
  }

  /** GET /admin/settings/:key — one setting's value. */
  async get(key: string) {
    const row = await this.prisma.systemSetting.findUnique({
      where: { key },
    });
    return row ? { key: row.key, value: row.valueJson } : { key, value: null };
  }

  /** PATCH /admin/settings/:key — upsert valueJson. */
  upsert(key: string, value: unknown, actorId: string) {
    return this.prisma.systemSetting.upsert({
      where: { key },
      create: {
        key,
        valueJson: value as Prisma.InputJsonValue,
        updatedBy: actorId,
      },
      update: {
        valueJson: value as Prisma.InputJsonValue,
        updatedBy: actorId,
      },
    });
  }
}
