import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { BanksController } from './banks.controller';
import { SelectorService } from './selectors/selector.service';

/**
 * BanksModule — step 7.
 *
 * Provides the SelectorService (used by SessionsService for server-side
 * draws when an exercise has a bankSourceType) and the public
 * `POST /banks/:bankType/draw` endpoint (spec D.6).
 *
 * PrismaModule and QueueModule are @Global in this app, so they are not
 * listed in imports.
 */
@Module({
  imports: [EventsModule],
  controllers: [BanksController],
  providers: [SelectorService],
  exports: [SelectorService],
})
export class BanksModule {}
