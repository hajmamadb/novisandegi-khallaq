import { Module } from '@nestjs/common';
import { MentorshipController } from './mentorship.controller';
import { MentorshipService } from './mentorship.service';

// DECISION: PrismaModule is @Global(), so only controller + service here.
@Module({
  controllers: [MentorshipController],
  providers: [MentorshipService],
})
export class MentorshipModule {}
