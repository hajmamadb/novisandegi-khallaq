import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { AdminSettingsService } from './admin-settings.service';

// DECISION: JwtAuthGuard applies @Roles internally.
@UseGuards(JwtAuthGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/settings')
export class AdminSettingsController {
  constructor(private readonly settings: AdminSettingsService) {}

  @Get()
  list() {
    return this.settings.list();
  }

  @Get(':key')
  get(@Param('key') key: string) {
    return this.settings.get(key);
  }

  @Patch(':key')
  upsert(
    @CurrentUser() user: JwtUser,
    @Param('key') key: string,
    @Body() body: { value: unknown },
  ) {
    return this.settings.upsert(key, body.value, user.sub);
  }
}
