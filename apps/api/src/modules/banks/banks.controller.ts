import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { BankType } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { SelectorService } from './selectors/selector.service';
import { DrawDto } from './dto/draw.dto';

/**
 * D.6: `POST /banks/:bankType/draw` (and a restricted browse list for
 * ADMIN/MENTOR/EDITOR).
 *
 * `:bankType` is validated against the BankType enum — we want a 400 for an
 * unknown bank name, not a 500 from Prisma.
 */
@UseGuards(JwtAuthGuard)
@Controller('banks')
export class BanksController {
  constructor(
    private readonly selector: SelectorService,
    private readonly prisma: PrismaService,
  ) {}

  @Post(':bankType/draw')
  async draw(
    @Param('bankType') rawBankType: string,
    @Body() dto: DrawDto,
    @CurrentUser() user: JwtUser,
  ) {
    const bankType = parseBankType(rawBankType);
    const filters: Record<string, unknown> = {};
    if (dto.genre) filters.genre = dto.genre;
    if (dto.mood) filters.mood = dto.mood;
    if (dto.difficulty != null) filters.difficulty = dto.difficulty;
    if (dto.category) filters.category = dto.category;
    if (dto.maxAgeDays != null) filters.maxAgeDays = dto.maxAgeDays;
    const hasFilters = Object.keys(filters).length > 0;
    return this.selector.draw(
      user.sub,
      bankType,
      dto.exerciseSlug,
      dto.sessionId,
      hasFilters ? filters : undefined,
    );
  }

  /**
   * GET /banks/:bankType — browse the usable items (ADMIN/MENTOR/EDITOR only
   * in phase 1; the general user-facing browse UI is phase 2).
   */
  @Get(':bankType')
  async list(
    @Param('bankType') rawBankType: string,
    @CurrentUser() user: JwtUser,
  ) {
    if (
      user.role !== 'ADMIN' &&
      user.role !== 'MENTOR' &&
      user.role !== 'EDITOR'
    ) {
      throw new ForbiddenException('BANK_BROWSE_FORBIDDEN');
    }
    const bankType = parseBankType(rawBankType);
    const key = delegateFor(bankType);
    const where =
      bankType === 'NEWS'
        ? { status: 'APPROVED', isSensitive: false }
        : bankType === 'WORD'
          ? { isActive: true }
          : { isActive: true, approvalStatus: 'APPROVED' };
    // DECISION: orderBy id (not createdAt) — not every bank model has a
    // createdAt column. UUIDs give a stable, reproducible list order.
    const delegate = this.prisma[key] as unknown as {
      findMany: (args: {
        where: Record<string, unknown>;
        orderBy: { id: 'asc' };
      }) => Promise<unknown[]>;
    };
    return delegate.findMany({ where, orderBy: { id: 'asc' } });
  }
}

/** 400 for an unknown bank name (instead of letting Prisma throw). */
export function parseBankType(raw: string): BankType {
  if (!Object.values(BankType).includes(raw as BankType)) {
    throw new BadRequestException(`INVALID_BANK_TYPE:${raw}`);
  }
  return raw as BankType;
}

/** Minimal delegate mapping for the browse endpoint (full map in selector.util). */
function delegateFor(bankType: BankType): keyof import('@prisma/client').PrismaClient {
  const map: Partial<Record<BankType, keyof import('@prisma/client').PrismaClient>> = {
    CHARACTER: 'character',
    PLACE: 'place',
    OPENING_LINE: 'openingLine',
    STYLE_PARAGRAPH: 'styleParagraph',
    REFERENCE_STORY: 'referenceStory',
    NEWS: 'newsItem',
    IMAGE: 'imageAsset',
    OBJECT: 'objectItem',
    EMOTION: 'emotionLexicon',
    WHAT_IF: 'whatIfQuestion',
    STRUCTURE_PHRASE: 'structurePhrase',
    WORD: 'word',
    CUTUP_TEXT: 'cutupText',
  };
  const k = map[bankType];
  if (!k) throw new BadRequestException(`BANK_NOT_WIRED:${bankType}`);
  return k;
}
