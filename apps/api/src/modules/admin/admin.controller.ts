import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminService } from './admin.service';

/** Spec D.14 — ADMIN-only analytics + management. */
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  /** GET /admin/analytics/overview — platform-wide aggregates. */
  @Get('analytics/overview')
  overview() {
    return this.admin.overview();
  }

  /** GET /admin/users — paginated user list. */
  @Get('users')
  listUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('role') role?: string,
    @Query('search') search?: string,
  ) {
    return this.admin.listUsers({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      role,
      search,
    });
  }

  /** PATCH /admin/users/:id/role — change a user's role (ADMIN only). */
  @Patch('users/:id/role')
  changeRole(
    @Param('id') id: string,
    @Body('role') role: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.admin.changeRole(id, role as UserRole, user.id);
  }

  /** GET /admin/badges — all badges with award counts. */
  @Get('badges')
  listBadges() {
    return this.admin.listBadges();
  }

  /** GET /admin/anomalies — paginated anomaly flags. */
  @Get('anomalies')
  listAnomalies(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('severity') severity?: string,
    @Query('resolved') resolved?: string,
    @Query('anomalyType') anomalyType?: string,
  ) {
    return this.admin.listAnomalies({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      severity,
      resolved: resolved !== undefined ? resolved === 'true' : undefined,
      anomalyType,
    });
  }

  /** PATCH /admin/anomalies/:id/resolve — resolve an anomaly. */
  @Patch('anomalies/:id/resolve')
  resolveAnomaly(
    @Param('id') id: string,
    @Body('note') note: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.admin.resolveAnomaly(id, note, user.id);
  }

  /** GET /admin/audit-log — paginated audit log. */
  @Get('audit-log')
  listAuditLog(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('action') action?: string,
    @Query('actorId') actorId?: string,
  ) {
    return this.admin.listAuditLog({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      action,
      actorId,
    });
  }
}
