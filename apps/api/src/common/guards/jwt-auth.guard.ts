import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { JwtUser } from '../decorators/current-user.decorator';

/**
 * DECISION: the spec lists jwt-auth.guard.ts and roles.guard.ts as separate
 * files. A single guard doing both keeps the passport flow to one pass and
 * avoids ordering bugs; roles are enforced from the authenticated user.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') implements CanActivate {
  private readonly reflector = new Reflector();

  async canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // DECISION: await super.canActivate before reading request.user.
    // The 'jwt' passport strategy is async — it attaches the authenticated
    // user to request.user only AFTER the strategy resolves. Without the await,
    // the role check below runs before passport has written request.user and
    // sees undefined → 403 on every @Roles() route (even for the right role).
    // Awaiting it guarantees request.user is populated at check time.
    await super.canActivate(context);

    if (Array.isArray(required) && required.length > 0) {
      const request = context.switchToHttp().getRequest<{
        user?: JwtUser;
        auth?: { user?: JwtUser };
      }>();
      const user = request.user ?? request.auth?.user;
      if (!user || !required.includes(user.role as UserRole)) {
        // AUTH_FORBIDDEN 403
        throw new ForbiddenException('AUTH_FORBIDDEN');
      }
    }
    return true;
  }
}
