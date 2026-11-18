import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { JwtUser } from '../decorators/current-user.decorator';

/**
 * DECISION: kept as a standalone role-checking guard for API compatibility
 * with the spec's file layout. In practice JwtAuthGuard (which extends
 * AuthGuard('jwt')) already enforces @Roles() in the same pass; use this one
 * only when the route is already behind JwtAuthGuard and you need a second
 * explicit role gate.
 */
@Injectable()
export class RolesGuard {
  private readonly reflector = new Reflector();

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<{ user?: JwtUser; auth?: { user?: JwtUser } }>();
    const user = request.user ?? request.auth?.user;
    if (!user || !required.includes(user.role as UserRole)) {
      // AUTH_FORBIDDEN 403
      throw new ForbiddenException('AUTH_FORBIDDEN');
    }
    return true;
  }
}
