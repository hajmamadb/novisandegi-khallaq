import {
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { AdminApprovalsService } from './admin-approvals.service';

// DECISION: JwtAuthGuard applies @Roles internally (awaits super.canActivate
// before reading request.user) — belt-and-suspenders RolesGuard omitted.
@UseGuards(JwtAuthGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/approvals')
export class AdminApprovalsController {
  constructor(private readonly approvals: AdminApprovalsService) {}

  /** GET /admin/approvals — list all pending items. */
  @Get()
  list(): Promise<{ items: unknown[] }> {
    return this.approvals.list();
  }

  /** POST /admin/approvals/:source/:id/approve */
  @Post(':source/:id/approve')
  approve(
    @CurrentUser() user: JwtUser,
    @Param('source') source: string,
    @Param('id') id: string,
  ) {
    return this.approvals.decide(source, id, 'approve', user.sub);
  }

  /** POST /admin/approvals/:source/:id/reject */
  @Post(':source/:id/reject')
  reject(
    @CurrentUser() user: JwtUser,
    @Param('source') source: string,
    @Param('id') id: string,
  ) {
    return this.approvals.decide(source, id, 'reject', user.sub);
  }
}
