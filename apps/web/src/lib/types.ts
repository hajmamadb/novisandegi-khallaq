// Shared frontend types, mirroring the API response shapes (spec E/D).
// Kept minimal — only what the pages in steps 11-13 render.

// Mirrors the Prisma UserRole enum (apps/api/prisma/schema.prisma).
export type UserRole =
  | 'NOVICE'
  | 'CRAFTSPERSON'
  | 'CREATIVE'
  | 'PROFESSIONAL'
  | 'MENTOR'
  | 'EDITOR'
  | 'ADMIN';

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  level: number;
  emailVerified: boolean;
  createdAt: string;
  // Populated by GET /users/me (userStats relation); absent on auth responses.
  xpTotal?: number;
  currentStreak?: number;
  bestStreak?: number;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
}

export interface UserStats {
  currentStreak: number;
  bestStreak: number;
  sessionsCount: number;
  wordsTotal: number;
  xpTotal: number;
  level: number;
}

export interface BadgeItem {
  id: string;
  slug: string;
  titleFa: string;
  descriptionFa: string;
  tier: string;
  iconAsset: string | null;
  earned: boolean;
  awardedAt: string | null;
  progress: { current: number; target: number } | null;
}

export interface ExerciseCardData {
  id: string;
  titleFa: string;
  descriptionFa: string;
  bankType: string;
  payloadJson: Record<string, unknown> | null;
}

export interface Session {
  id: string;
  status: string;
  createdAt: string;
  exercise: ExerciseCardData | null;
  wordCount: number | null;
  activeTimeSeconds: number | null;
}
