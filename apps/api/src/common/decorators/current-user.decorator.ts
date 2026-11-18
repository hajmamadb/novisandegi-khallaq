import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// DECISION: JWT payload shape kept minimal (sub, email, role) to avoid
// re-querying the DB on every request for identity fields.
export interface JwtUser {
  sub: string;
  email: string;
  role: string;
}

export const CurrentUser = createParamDecorator(
  (data: keyof JwtUser | undefined, ctx: ExecutionContext): JwtUser | unknown => {
    const request = ctx.switchToHttp().getRequest<{ user: JwtUser }>();
    if (!data) return request.user;
    return request.user?.[data];
  },
);
