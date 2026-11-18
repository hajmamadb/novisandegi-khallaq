import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { StreakService } from './streak.service';
import { XpService } from './xp.service';
import { BadgeService } from './badges/badges.service';
import { BadgeController } from './badges/badges.controller';
import { QuestService } from './quests/quest.service';
import { QuestsController } from './quests/quests.controller';
import { SeriesService } from './series/series.service';
import { SeriesController } from './series/series.controller';
import { StaircaseService } from './staircase/staircase.service';
import { StaircaseController } from './staircase/staircase.controller';

// DECISION: PrismaModule is @Global() so it is not imported here. EventsModule
// is needed by StreakService (it emits streak_extended / freeze / break
// events, each of which enqueues a badge-evaluate job) and BadgeService.
// SeriesService is exported for SessionsService (submit-time series hook,
// spec Phase 2 — per-user progression tracks). StaircaseService is likewise
// exported for the submit-path word-target hook.
@Module({
  imports: [EventsModule],
  controllers: [BadgeController, QuestsController, SeriesController, StaircaseController],
  providers: [XpService, StreakService, BadgeService, QuestService, SeriesService, StaircaseService],
  exports: [XpService, StreakService, BadgeService, QuestService, SeriesService, StaircaseService],
})
export class GamificationModule {}
