import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

// DECISION: PrismaModule is @Global(), so only controller + service here.
@Module({
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
