import { UserRole } from '@prisma/client';

/**
 * DECISION: spec E.2 step 1 requires an access-level ordering
 * (NOVICE < CRAFTSPERSON < ... < ADMIN). Prisma enums carry no numeric
 * rank, so we keep the canonical ordering here and compare by index.
 * A higher role rank satisfies a lower accessLevel requirement.
 */
const ROLE_RANK: Record<UserRole, number> = {
  NOVICE: 0,
  CRAFTSPERSON: 1,
  CREATIVE: 2,
  PROFESSIONAL: 3,
  MENTOR: 4,
  EDITOR: 5,
  ADMIN: 6,
};

/** Numeric rank of a role (0..6). */
export function roleRank(role: UserRole): number {
  return ROLE_RANK[role] ?? 0;
}

/** True if `role` meets or exceeds the `accessLevel` requirement. */
export function canAccess(role: UserRole, accessLevel: UserRole): boolean {
  return roleRank(role) >= roleRank(accessLevel);
}
