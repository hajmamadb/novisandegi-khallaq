import { Module } from '@nestjs/common';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';
import { EventsModule } from '../events/events.module';
import { BanksModule } from '../banks/banks.module';
import { IntegrityModule } from '../integrity/integrity.module';
import { GamificationModule } from '../gamification/gamification.module';
import { ExercisesModule } from '../exercises/exercises.module';

// DECISION: PrismaModule and QueueModule are @Global(), so we import
// EventsModule (exports EventsService for logging), BanksModule (exports
// SelectorService for server-side bank draws, step 7), IntegrityModule
// (exports IntegrityService for the submit-time integrity pipeline, step 8)
// and GamificationModule (exports XpService + StreakService, step 9).
// ExercisesModule exports ExerciseValidator — the per-exercise constraint
// check (lipogram / n7 / clustering / structure / style) driven by the
// exercise's rubricJson.
@Module({
  imports: [EventsModule, BanksModule, IntegrityModule, GamificationModule, ExercisesModule],
  controllers: [SessionsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
