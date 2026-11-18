import { Module } from '@nestjs/common';
import { AdminApprovalsController } from './admin-approvals.controller';
import { AdminApprovalsService } from './admin-approvals.service';

// DECISION: PrismaModule is @Global(); admin access is enforced via
// JwtAuthGuard (applies @Roles) inside the controller.
@Module({
  controllers: [AdminApprovalsController],
  providers: [AdminApprovalsService],
})
export class AdminApprovalsModule {}
