import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

// DECISION: RolesGuard (Step 3 Users) consumes this metadata; ADMIN/MENTOR
// endpoints guard with @Roles(...) as required by the spec security rules.
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
