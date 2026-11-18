import {
  Body,
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { MessagesService } from './messages.service';

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get('threads')
  threads(@CurrentUser() user: JwtUser) {
    return this.messages.listThreads(user.sub);
  }

  @Get('threads/:participantId')
  conversation(
    @CurrentUser() user: JwtUser,
    @Param('participantId') participantId: string,
  ) {
    return this.messages.conversation(user.sub, participantId);
  }

  @Post()
  send(
    @CurrentUser() user: JwtUser,
    @Body() body: { recipientId: string; body: string },
  ) {
    if (user.sub === body.recipientId) {
      throw new BadRequestException('SELF_MESSAGE_NOT_ALLOWED');
    }
    return this.messages.send(user.sub, body.recipientId, body.body);
  }
}
