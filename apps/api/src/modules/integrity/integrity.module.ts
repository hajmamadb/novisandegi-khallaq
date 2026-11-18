import { Module } from '@nestjs/common';
import { IntegrityService } from './integrity.service';
import { NlpService } from './nlp.service';

// DECISION: no controllers — IntegrityService is invoked synchronously from
// the SessionsService submit flow (spec E.4). PrismaModule/ConfigModule are
// global, so only the two providers are declared here.
@Module({
  providers: [IntegrityService, NlpService],
  exports: [IntegrityService],
})
export class IntegrityModule {}
