import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { BadgeService } from './badges.service';

/**
 * Spec E.7 — Badge endpoints.
 *
 * GET  /gamification/badges          — list badges with award/progress
 * GET  /gamification/badges/:slug   — single badge detail
 * POST /gamification/badges/:awardId/verify — MENTOR/EDITOR manual verify
 */
@UseGuards(JwtAuthGuard)
@Controller('gamification/badges')
export class BadgeController {
  constructor(private readonly badges: BadgeService) {}

  @Get()
  list(@CurrentUser() user: JwtUser): Promise<unknown[]> {
    return this.badges.listForUser(user.sub);
  }

  @Get(':slug')
  getOne(@CurrentUser() user: JwtUser, @Param('slug') slug: string): Promise<unknown> {
    return this.badges.getBySlug(slug, user.sub);
  }

  // DECISION: first use of @Roles() in a controller — JwtAuthGuard
  // already enforces role metadata via Reflector.getAllAndOverride.
  @Post(':awardId/verify')
  @Roles(UserRole.MENTOR, UserRole.EDITOR)
  verify(
    @CurrentUser() user: JwtUser,
    @Param('awardId') awardId: string,
  ): Promise<unknown> {
    return this.badges.verifyAward(awardId, user.sub);
  }
}
