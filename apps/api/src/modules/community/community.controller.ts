import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { FeedbackTargetKind } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { CommunityService } from './community.service';

// DECISION: news is public content (used on the landing page later);
// feedback and corpse are collaborative and need a logged-in user.
@Controller('community')
export class CommunityController {
  constructor(private readonly community: CommunityService) {}

  @Get('news')
  news() {
    return this.community.listNews();
  }

  // DECISION: /news/today is per-user (no-repeat window is keyed on the
  // logged-in user), so it needs the guard. Route order matters — 'news/today'
  // is declared before any parametric news route (there is none), so no clash.
  @Get('news/today')
  @UseGuards(JwtAuthGuard)
  todayNews(@CurrentUser() user: JwtUser) {
    return this.community.dailyNews(user.sub);
  }

  @Get('feedback')
  @UseGuards(JwtAuthGuard)
  feedback(@CurrentUser() user: JwtUser) {
    return this.community.listFeedback(user.sub);
  }

  @Post('feedback')
  @UseGuards(JwtAuthGuard)
  createFeedback(
    @CurrentUser() user: JwtUser,
    @Body()
    body: {
      authorId: string;
      targetKind: FeedbackTargetKind;
      targetId: string;
      content: string;
      rating?: number;
    },
  ) {
    return this.community.createFeedback(user.sub, body);
  }

  // ── Exquisite corpse (جسد نفیس) ──

  @Get('corpse')
  @UseGuards(JwtAuthGuard)
  openChains() {
    return this.community.listOpenChains();
  }

  @Post('corpse/start')
  @UseGuards(JwtAuthGuard)
  startChain() {
    return this.community.startChain();
  }

  @Get('corpse/:id')
  @UseGuards(JwtAuthGuard)
  getChain(@Param('id') id: string) {
    return this.community.getChain(id);
  }

  @Post('corpse/:id/add')
  @UseGuards(JwtAuthGuard)
  addSegment(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() body: { segmentText: string },
  ) {
    return this.community.addSegment(id, user.sub, body.segmentText);
  }
}
