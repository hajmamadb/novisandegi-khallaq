import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../../../common/decorators/current-user.decorator';
import { StaircaseService } from './staircase.service';

/**
 * Spec Phase 2 — Word Target Staircase endpoints.
 *
 * GET   /gamification/staircase         — get (and lazily create) the user's staircase
 * POST  /gamification/staircase/reset   — reset back to rung 0
 */
@UseGuards(JwtAuthGuard)
@Controller('gamification/staircase')
export class StaircaseController {
  constructor(private readonly staircase: StaircaseService) {}

  @Get()
  get(@CurrentUser() user: JwtUser) {
    return this.staircase.get(user.sub);
  }

  @Post('reset')
  reset(@CurrentUser() user: JwtUser) {
    return this.staircase.reset(user.sub);
  }
}
