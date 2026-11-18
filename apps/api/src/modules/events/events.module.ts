import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  controllers: [EventsController],
  providers: [EventsService],
  // Exported so other feature modules (sessions, badges) can log events
  // through the same append-only EventLog path.
  exports: [EventsService],
})
export class EventsModule {}
