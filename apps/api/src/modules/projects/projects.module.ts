import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

// DECISION: PrismaModule is @Global(), so only controller + service here.
@Module({
  imports: [EventsModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
})
export class ProjectsModule {}
