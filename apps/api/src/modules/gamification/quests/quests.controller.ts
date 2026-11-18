import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../../../common/decorators/current-user.decorator';
import { QuestService } from './quest.service';

/**
 * Spec I.10 + E.7 — quest and skill endpoints.
 *
 * GET  /gamification/quests/today   — today's daily quests with progress
 * POST /gamification/quests/:id/claim — claim the reward for a completed quest
 * GET  /gamification/skills         — all skill rows (xpTotal desc)
 */
@UseGuards(JwtAuthGuard)
@Controller('gamification')
export class QuestsController {
  constructor(private readonly quests: QuestService) {}

  @Get('quests/today')
  today(@CurrentUser() user: JwtUser): Promise<unknown[]> {
    return this.quests.today(user.sub);
  }

  @Post('quests/:id/claim')
  claim(@CurrentUser() user: JwtUser, @Param('id') id: string): Promise<unknown> {
    return this.quests.claim(user.sub, id);
  }

  @Get('skills')
  skills(@CurrentUser() user: JwtUser): Promise<unknown[]> {
    return this.quests.listSkills(user.sub);
  }
}
