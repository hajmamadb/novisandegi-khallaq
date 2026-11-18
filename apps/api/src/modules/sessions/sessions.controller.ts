import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SessionStatus, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { SessionsService, ListSessionsQuery } from './sessions.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { SaveDraftDto } from './dto/save-draft.dto';
import { SubmitSessionDto } from './dto/submit-session.dto';

@Controller('sessions')
@UseGuards(JwtAuthGuard)
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  /** POST /sessions — start a practice session (spec E.2 createSession). */
  @Post()
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateSessionDto) {
    // DECISION: JwtUser.role is typed string; cast to the Prisma UserRole
    // enum the service expects (the guard only lets valid roles through).
    return this.sessions.create(user.sub, user.role as UserRole, dto);
  }

  /**
   * GET /sessions/active — in-flight sessions.
   * Declared before `:id` so 'active' isn't captured as a session id.
   */
  @Get('active')
  listActive(@CurrentUser() user: JwtUser) {
    return this.sessions.listActive(user.sub);
  }

  /** GET /sessions — the user's sessions, optionally filtered. */
  @Get()
  listMine(
    @CurrentUser() user: JwtUser,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const query: ListSessionsQuery = { from, to };
    if (status && Object.values(SessionStatus).includes(status as SessionStatus)) {
      query.status = status as SessionStatus;
    }
    return this.sessions.listMine(user.sub, query);
  }

  /** GET /sessions/:id — owner (or ADMIN) detail with drafts + submission. */
  @Get(':id')
  getById(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
  ) {
    return this.sessions.getById(id, user.sub, user.role as UserRole);
  }

  /** POST /sessions/:id/drafts — persist a versioned draft (spec D.5). */
  @Post(':id/drafts')
  saveDraft(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: SaveDraftDto,
  ) {
    return this.sessions.saveDraft(id, user.sub, dto);
  }

  /** POST /sessions/:id/submit — finalize the session (spec E.2 submitSession). */
  @Post(':id/submit')
  submit(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: SubmitSessionDto,
  ) {
    return this.sessions.submit(id, user.sub, dto);
  }

  /** POST /sessions/:id/abandon — give up on an in-flight session. */
  @Post(':id/abandon')
  abandon(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.sessions.abandon(id, user.sub);
  }

  /**
   * POST /sessions/:id/reroll — re-draw the bank source item for an
   * in-progress, bank-driven session. Capped at REROLL_PER_SESSION_LIMIT (spec K.2).
   */
  @Post(':id/reroll')
  reroll(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.sessions.reroll(id, user.sub);
  }

  /** DELETE /sessions/:id — soft delete a session (30-day trash). */
  @Delete(':id')
  delete(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.sessions.delete(id, user.sub);
  }

  /** POST /sessions/:id/restore — restore a soft-deleted session. */
  @Post(':id/restore')
  restore(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.sessions.restore(id, user.sub);
  }

  /** GET /sessions/:id/drafts — all draft versions, ascending. */
  @Get(':id/drafts')
  listDrafts(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
  ) {
    return this.sessions.listDrafts(id, user.sub);
  }

  /** GET /sessions/:id/drafts/:version — a single draft version. */
  @Get(':id/drafts/:version')
  getDraft(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    return this.sessions.getDraft(id, user.sub, version);
  }
}
