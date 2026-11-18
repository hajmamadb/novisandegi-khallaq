import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

// DECISION: PrismaModule is @Global(), so only controller + service here.
@Module({
  controllers: [MessagesController],
  providers: [MessagesService],
})
export class MessagesModule {}
