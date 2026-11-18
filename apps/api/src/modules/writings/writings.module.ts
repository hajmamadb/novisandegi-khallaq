import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { WritingsController } from './writings.controller';
import { WritingsService } from './writings.service';

// DECISION: PrismaModule is @Global(), so only controller + service here.
@Module({
  imports: [EventsModule],
  controllers: [WritingsController],
  providers: [WritingsService],
})
export class WritingsModule {}
