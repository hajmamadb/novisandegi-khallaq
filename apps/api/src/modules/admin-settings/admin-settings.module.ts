import { Module } from '@nestjs/common';
import { AdminSettingsController } from './admin-settings.controller';
import { AdminSettingsService } from './admin-settings.service';

// DECISION: PrismaModule is @Global(); admin access enforced via JwtAuthGuard
// (applies @Roles) inside the controller.
@Module({
  controllers: [AdminSettingsController],
  providers: [AdminSettingsService],
})
export class AdminSettingsModule {}
