import { Controller, Get, Query, UseGuards, Res } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { HistoryService, TimelineQuery } from './history.service';

/** Spec D.10 — owner's writing history: timeline, stats, export. */
@Controller('history')
@UseGuards(JwtAuthGuard)
export class HistoryController {
  constructor(private readonly history: HistoryService) {}

  /** GET /history/timeline — paginated, filterable session list. */
  @Get('timeline')
  timeline(
    @CurrentUser() user: JwtUser,
    @Query() q: TimelineQuery,
  ) {
    return this.history.timeline(user.sub, q);
  }

  /** GET /history/stats — lifetime aggregates. */
  @Get('stats')
  stats(@CurrentUser() user: JwtUser) {
    return this.history.stats(user.sub);
  }

  /**
   * GET /history/export?format=json|markdown — downloads the full history.
   * JSON → application/json; Markdown → text/markdown with a .md filename.
   */
  @Get('export')
  async export(
    @CurrentUser() user: JwtUser,
    @Query('format') format: string,
    @Res() res: Response,
  ) {
    const fmt = this.history.exportFormat(format ?? 'json');
    const payload = await this.history.buildExport(user.sub, fmt);

    if (fmt === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="history.json"');
      return res.json(payload);
    }
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="history.md"');
    res.send(payload.markdown);
  }
}
