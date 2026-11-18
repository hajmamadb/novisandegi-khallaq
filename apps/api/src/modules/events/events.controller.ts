import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { createHash } from 'crypto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { EventsService, ListMyEventsQuery } from './events.service';
import { LogEventDto } from './dto/log-event.dto';

/** SHA-256 of a string, hex. Used to hash IP / UA for privacy (spec ipHash). */
function hash(str: string): string {
  return createHash('sha256').update(str).digest('hex');
}

@Controller('events')
@UseGuards(JwtAuthGuard)
export class EventsController {
  constructor(private readonly events: EventsService) {}

  /** POST /events — append an event to the user's log. */
  @Post()
  create(
    @CurrentUser() user: JwtUser,
    @Body() dto: LogEventDto,
    @Req() req: Request,
  ) {
    const ipHash = req.ip ? hash(req.ip) : undefined;
    const userAgent = req.headers['user-agent'];
    const userAgentHash = userAgent ? hash(userAgent) : undefined;
    return this.events.log(user.sub, dto, { ipHash, userAgentHash });
  }

  /** GET /events/me — the user's own events, newest first, paginated. */
  @Get('me')
  listMine(
    @CurrentUser() user: JwtUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('eventName') eventName?: string,
  ) {
    const query: ListMyEventsQuery = {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      eventName,
    };
    return this.events.listMine(user.sub, query);
  }
}
