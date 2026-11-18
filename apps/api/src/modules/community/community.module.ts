import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { CommunityController } from './community.controller';
import { CommunityService } from './community.service';

// DECISION: PrismaModule is @Global(), so only controller + service here.
@Module({
  imports: [EventsModule],
  controllers: [CommunityController],
  providers: [CommunityService],
})
export class CommunityModule {}
