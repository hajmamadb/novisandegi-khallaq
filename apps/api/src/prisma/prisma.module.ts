import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// DECISION: Prisma module is global so any module can inject PrismaService
// without re-importing it (matches the spec's cross-cutting usage in E.9).
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
