import { Body, Controller, Get, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../../../common/decorators/current-user.decorator';
import { SeriesService } from './series.service';

/**
 * Spec Phase 2 — per-user exercise series endpoints.
 *
 * GET  /gamification/series            — list all series for the current user
 * POST /gamification/series/start      — explicitly start a MORNING_PAGES / WORD_GOAL
 * POST /gamification/series/:id/suspend — suspend an active series
 * POST /gamification/series/:id/resume  — resume a suspended series
 */
@UseGuards(JwtAuthGuard)
@Controller('gamification/series')
export class SeriesController {
  constructor(private readonly series: SeriesService) {}

  @Get()
  list(@CurrentUser() user: JwtUser): Promise<unknown[]> {
    return this.series.list(user.sub);
  }

  /**
   * GET /gamification/series/by-type?type=SENSES — single active series by
   * type, no auto-init. Powers the practice-page progress bar (spec: «اگر
   * سری‌محور: نوار پیشرفت سری»). Returns 404 when no active series exists.
   */
  @Get('by-type')
  async byType(
    @CurrentUser() user: JwtUser,
    @Query('type') type: string,
  ): Promise<unknown> {
    const row = await this.series.getByType(user.sub, type ?? '');
    if (!row) throw new NotFoundException('SERIES_NOT_FOUND');
    return row;
  }

  @Post('start')
  start(
    @CurrentUser() user: JwtUser,
    @Body() body: { type: string; target?: number },
  ): Promise<unknown> {
    return this.series.start(user.sub, body.type, { target: body.target });
  }

  @Post(':id/suspend')
  suspend(@CurrentUser() user: JwtUser, @Param('id') id: string): Promise<unknown> {
    return this.series.suspend(user.sub, id);
  }

  @Post(':id/resume')
  resume(@CurrentUser() user: JwtUser, @Param('id') id: string): Promise<unknown> {
    return this.series.resume(user.sub, id);
  }
}
