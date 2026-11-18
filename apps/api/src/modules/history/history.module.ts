import { Module } from '@nestjs/common';
import { HistoryController } from './history.controller';
import { HistoryService } from './history.service';

// DECISION: PrismaModule is @Global(), so only the controller + service are
// declared here (no Prisma import needed).
@Module({
  controllers: [HistoryController],
  providers: [HistoryService],
})
export class HistoryModule {}
