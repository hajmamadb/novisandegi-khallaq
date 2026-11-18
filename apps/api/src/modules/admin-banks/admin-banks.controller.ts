import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtUser } from '../../common/decorators/current-user.decorator';
import { AdminBanksService } from './admin-banks.service';

/**
 * Admin CRUD for all content banks.
 *
 * GET    admin/banks/:bankType       — list all items (all statuses)
 * POST   admin/banks/:bankType       — create a new item
 * PATCH  admin/banks/:bankType/:id   — update an item
 * DELETE admin/banks/:bankType/:id   — delete an item
 */
@UseGuards(JwtAuthGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/banks')
export class AdminBanksController {
  constructor(private readonly adminBanks: AdminBanksService) {}

  @Get(':bankType')
  list(@Param('bankType') bankType: string) {
    return this.adminBanks.list(bankType);
  }

  @Post(':bankType')
  create(
    @Param('bankType') bankType: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.adminBanks.create(bankType, body, user.sub);
  }

  @Patch(':bankType/:id')
  update(
    @Param('bankType') bankType: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.adminBanks.update(bankType, id, body, user.sub);
  }

  @Patch(':bankType/:id/toggle-active')
  toggleActive(
    @Param('bankType') bankType: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.adminBanks.toggleActive(bankType, id, user.sub);
  }

  @Delete(':bankType/:id')
  delete(
    @Param('bankType') bankType: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.adminBanks.remove(bankType, id, user.sub);
  }
}
