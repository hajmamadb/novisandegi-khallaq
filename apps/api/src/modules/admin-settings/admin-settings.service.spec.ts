import { Test, TestingModule } from '@nestjs/testing';
import { AdminSettingsService } from './admin-settings.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AdminSettingsService', () => {
  let service: AdminSettingsService;
  let prisma: {
    systemSetting: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      upsert: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      systemSetting: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminSettingsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(AdminSettingsService);
  });

  it('list returns a key→value map plus raw rows, ordered by key', async () => {
    prisma.systemSetting.findMany.mockResolvedValue([
      { key: 'a', valueJson: 1 },
      { key: 'b', valueJson: { x: true } },
    ]);
    const res = await service.list();
    expect(prisma.systemSetting.findMany).toHaveBeenCalledWith({
      orderBy: { key: 'asc' },
    });
    expect(res.settings).toEqual({ a: 1, b: { x: true } });
    expect(res.rows).toHaveLength(2);
  });

  it('get returns the stored value, or null when the key is absent', async () => {
    prisma.systemSetting.findUnique.mockResolvedValue(null);
    const res = await service.get('missing');
    expect(res).toEqual({ key: 'missing', value: null });
  });

  it('upsert passes valueJson and updatedBy for both create and update', async () => {
    prisma.systemSetting.upsert.mockResolvedValue({});
    await service.upsert('flag', { on: true }, 'admin');
    expect(prisma.systemSetting.upsert).toHaveBeenCalledWith({
      where: { key: 'flag' },
      create: { key: 'flag', valueJson: { on: true }, updatedBy: 'admin' },
      update: { valueJson: { on: true }, updatedBy: 'admin' },
    });
  });
});
