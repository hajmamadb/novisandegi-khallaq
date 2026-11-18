import { Module } from '@nestjs/common';
import { AdminBanksController } from './admin-banks.controller';
import { AdminBanksService } from './admin-banks.service';

// DECISION: PrismaModule is @Global(), so only controller + service here.
@Module({
  controllers: [AdminBanksController],
  providers: [AdminBanksService],
})
export class AdminBanksModule {}
